import { computed, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { Gallery } from '@vie/gallery-contracts'
import { apiFetch } from '../api'

export interface WorkspacePhoto {
  id: string
  galleryId: string
  title?: string | null
  sortOrder: number
  cover: boolean
  status: 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED' | string
  createdAt?: string
  byteSize?: number
  width?: number
  height?: number
  thumbnailUrl?: string
}

export type WorkspaceErrorKind = 'unauthorized' | 'forbidden' | 'not-found' | 'network' | 'unknown'

export interface WorkspaceError {
  kind: WorkspaceErrorKind
  message: string
  status?: number
}

export interface UploadSummary {
  succeeded: number
  failed: number
  timedOut: number
}

interface UploadItem {
  photoId: string
  taskId: string
  status?: string
}

interface TaskState {
  status: string
  errorMessage?: string | null
}

function errorMessageFor(status: number, fallback: string) {
  if (status === 401) return '登录状态已失效，请返回空间列表重新登录。'
  if (status === 403) return '你没有权限访问这个空间。'
  if (status === 404) return '找不到这个相册空间，可能已被移除或链接有误。'
  if (status === 409) return '当前操作与空间状态冲突，请刷新后重试。'
  if (status === 413) return '文件体积超过限制，请选择较小的照片。'
  if (status >= 500) return '服务暂时不可用，请稍后重试。'
  return fallback
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  let message = errorMessageFor(response.status, fallback)
  try {
    const body = await response.json() as { message?: string; code?: string }
    if (response.status < 500 && body.message) message = body.message
  } catch {
    // The status-based message is enough when the response is not JSON.
  }
  return new Error(message)
}

function classifyError(error: unknown, fallback: string): WorkspaceError {
  const message = error instanceof Error ? error.message : fallback
  if (message.includes('登录') || message.includes('身份')) return { kind: 'unauthorized', message, status: 401 }
  if (message.includes('权限')) return { kind: 'forbidden', message, status: 403 }
  if (message.includes('找不到') || message.includes('不存在')) return { kind: 'not-found', message, status: 404 }
  if (error instanceof TypeError || message.includes('网络')) return { kind: 'network', message }
  return { kind: 'unknown', message }
}

export function useGalleryWorkspace(
  galleryId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true
) {
  const id = computed(() => toValue(galleryId))
  const isEnabled = computed(() => toValue(enabled))
  const gallery = ref<Gallery | null>(null)
  const photos = ref<WorkspacePhoto[]>([])
  const loading = ref(true)
  const error = ref<WorkspaceError | null>(null)
  const uploading = ref(false)
  const uploadProgress = ref(0)
  const uploadStatusText = ref('')

  let requestVersion = 0
  let uploadVersion = 0

  function isCurrent(version: number) {
    return version === requestVersion
  }

  async function loadPhotos(galleryIdValue: string, version: number) {
    const response = await apiFetch(`/api/galleries/${galleryIdValue}/photos`)
    if (!response.ok) throw await responseError(response, '照片列表加载失败。')
    const data = await response.json() as WorkspacePhoto[]
    if (isCurrent(version)) {
      photos.value = data.map(photo => ({
        ...photo,
        title: photo.title || undefined,
        thumbnailUrl: photo.thumbnailUrl || undefined,
        width: photo.width || undefined,
        height: photo.height || undefined
      }))
    }
  }

  async function reload() {
    const galleryIdValue = id.value
    const version = ++requestVersion
    if (!isEnabled.value) {
      gallery.value = null
      photos.value = []
      loading.value = false
      error.value = null
      return
    }
    if (!galleryIdValue) {
      gallery.value = null
      photos.value = []
      loading.value = false
      error.value = { kind: 'not-found', message: '缺少相册空间标识。', status: 404 }
      return
    }

    loading.value = true
    error.value = null
    try {
      const response = await apiFetch('/api/galleries')
      if (!response.ok) throw await responseError(response, '空间列表加载失败。')
      const galleries = await response.json() as Gallery[]
      const found = galleries.find(item => item.id === galleryIdValue) || null
      if (!found) {
        if (isCurrent(version)) {
          gallery.value = null
          photos.value = []
          error.value = { kind: 'not-found', message: '找不到这个相册空间，可能已被移除或链接有误。', status: 404 }
        }
        return
      }
      if (isCurrent(version)) gallery.value = found
      await loadPhotos(galleryIdValue, version)
    } catch (cause) {
      if (isCurrent(version)) {
        gallery.value = null
        photos.value = []
        error.value = classifyError(cause, '加载相册空间失败，请重试。')
      }
    } finally {
      if (isCurrent(version)) loading.value = false
    }
  }

  async function pollTask(taskId: string, version: number): Promise<'succeeded' | 'failed' | 'timedOut'> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 800))
      if (version !== uploadVersion) return 'timedOut'
      const response = await apiFetch(`/api/photos/tasks/${taskId}`)
      if (!response.ok) return 'failed'
      const task = await response.json() as TaskState
      if (task.status === 'SUCCEEDED') return 'succeeded'
      if (task.status === 'FAILED') return 'failed'
    }
    return 'timedOut'
  }

  async function uploadFiles(files: FileList | File[]): Promise<UploadSummary> {
    const galleryIdValue = id.value
    if (!galleryIdValue || !files.length) return { succeeded: 0, failed: 0, timedOut: 0 }

    const version = ++uploadVersion
    uploading.value = true
    uploadProgress.value = 8
    uploadStatusText.value = `正在上传 ${files.length} 张照片…`
    try {
      const form = new FormData()
      Array.from(files).forEach(file => form.append('files', file))
      const response = await apiFetch(`/api/galleries/${galleryIdValue}/photos`, {
        method: 'POST',
        body: form
      })
      if (!response.ok) throw await responseError(response, '照片上传失败，请检查文件格式。')

      const result = await response.json() as { items?: UploadItem[] }
      const items = result.items || []
      uploadProgress.value = items.length ? 35 : 100
      uploadStatusText.value = items.length ? '正在生成缩略图与 3D 纹理…' : '上传已完成'

      const outcomes = await Promise.all(items.map(item => pollTask(item.taskId, version)))
      const summary = outcomes.reduce<UploadSummary>((resultValue, outcome) => {
        resultValue[outcome === 'succeeded' ? 'succeeded' : outcome === 'failed' ? 'failed' : 'timedOut'] += 1
        return resultValue
      }, { succeeded: 0, failed: 0, timedOut: 0 })
      uploadProgress.value = 100
      uploadStatusText.value = summary.failed || summary.timedOut ? '部分照片需要检查处理状态' : '照片处理完成'
      await reload()
      return { succeeded: summary.succeeded || (items.length === 0 ? files.length : 0), failed: summary.failed, timedOut: summary.timedOut }
    } finally {
      if (version === uploadVersion) {
        await new Promise(resolve => setTimeout(resolve, 450))
        uploading.value = false
        uploadProgress.value = 0
        uploadStatusText.value = ''
      }
    }
  }

  async function setCover(photo: Pick<WorkspacePhoto, 'id'>) {
    const previous = photos.value
    photos.value = previous.map(item => ({ ...item, cover: item.id === photo.id }))
    try {
      const response = await apiFetch(`/api/photos/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover: true })
      })
      if (!response.ok) throw await responseError(response, '设置封面失败。')
      await reload()
    } catch (cause) {
      photos.value = previous
      throw cause
    }
  }

  async function deletePhoto(photoId: string) {
    const response = await apiFetch(`/api/photos/${photoId}`, { method: 'DELETE' })
    if (!response.ok) throw await responseError(response, '删除照片失败。')
    await reload()
  }

  watch([id, isEnabled], reload, { immediate: true })
  onUnmounted(() => {
    requestVersion += 1
    uploadVersion += 1
  })

  return {
    gallery,
    photos,
    loading,
    error,
    uploading,
    uploadProgress,
    uploadStatusText,
    reload,
    uploadFiles,
    setCover,
    deletePhoto
  }
}
