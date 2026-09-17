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
  rejected: number
}

interface UploadItem {
  filename?: string | null
  accepted?: boolean
  photoId?: string | null
  taskId?: string | null
  status?: string
  error?: { code?: string | null; message?: string | null } | null
}

class StatusError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

function errorMessageFor(status: number, fallback: string) {
  if (status === 401) return '登录状态已过期，请重新登录。'
  if (status === 403) return '您没有权限操作此展厅。'
  if (status === 404) return '展厅不存在或已被删除。'
  if (status === 409) return '操作冲突，请刷新后重试。'
  if (status === 413) return '上传文件超出大小限制。'
  if (status >= 500) return '服务暂时不可用，请稍后重试。'
  return fallback
}

async function responseError(response: Response, fallback: string): Promise<StatusError> {
  let message = errorMessageFor(response.status, fallback)
  try {
    const body = await response.json() as { message?: string; code?: string }
    if (response.status < 500 && body.message) message = body.message
  } catch {
    // The status-based message is enough when the response is not JSON.
  }
  return new StatusError(message, response.status)
}

function classifyError(error: unknown, fallback: string): WorkspaceError {
  const message = error instanceof Error ? error.message : fallback
  const status = error instanceof StatusError ? error.status : undefined
  if (status === 401 || message.includes('登录')) return { kind: 'unauthorized', message, status: 401 }
  if (status === 403 || message.includes('权限')) return { kind: 'forbidden', message, status: 403 }
  if (status === 404 || message.includes('不存在')) return { kind: 'not-found', message, status: 404 }
  if (error instanceof TypeError || message.includes('Failed to fetch') || message.includes('Network')) {
    return { kind: 'network', message: '网络连接异常，请检查网络。' }
  }
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
  const publishing = ref(false)

  let requestVersion = 0
  let uploadVersion = 0

  function isCurrent(version: number) {
    return version === requestVersion
  }

  async function loadPhotos(galleryIdValue: string, version: number) {
    const response = await apiFetch(`/api/galleries/${galleryIdValue}/photos`)
    if (!response.ok) throw await responseError(response, '照片列表加载失败，请稍后重试。')
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
      error.value = { kind: 'not-found', message: '展厅未找到', status: 404 }
      return
    }

    loading.value = true
    error.value = null
    try {
      const response = await apiFetch(`/api/galleries/${galleryIdValue}`)
      if (!response.ok) throw await responseError(response, '展厅信息加载失败，请稍后重试。')
      const found = await response.json() as Gallery
      if (isCurrent(version)) gallery.value = found
      await loadPhotos(galleryIdValue, version)
    } catch (cause) {
      if (isCurrent(version)) {
        gallery.value = null
        photos.value = []
        error.value = classifyError(cause, '展厅信息加载失败，请稍后重试。')
      }
    } finally {
      if (isCurrent(version)) loading.value = false
    }
  }

  async function uploadFiles(
    files: FileList | File[],
    options: { onQueued?: () => void | Promise<void>; batchId?: string } = {}
  ): Promise<UploadSummary> {
    const galleryIdValue = id.value
    if (!galleryIdValue || !files.length) return { succeeded: 0, failed: 0, timedOut: 0, rejected: 0 }

    const version = ++uploadVersion
    uploading.value = true
    uploadProgress.value = 20
    uploadStatusText.value = `正在上传 ${files.length} 张照片…`
    try {
      const form = new FormData()
      Array.from(files).forEach(file => form.append('files', file))
      const batchId = options.batchId ?? crypto.randomUUID()
      const idempotencyKey = crypto.randomUUID()
      const response = await apiFetch(`/api/galleries/${galleryIdValue}/photos`, {
        method: 'POST',
        headers: {
          'X-Client-Batch-Id': batchId,
          'Idempotency-Key': idempotencyKey
        },
        body: form
      })
      if (!response.ok) throw await responseError(response, '照片上传失败，请重试。')

      const result = await response.json() as { items?: UploadItem[] }
      const items = Array.isArray(result.items) ? result.items : []
      const acceptedItems = items.filter(item => item.accepted !== false && typeof item.taskId === 'string' && item.taskId)
      const rejected = Math.max(0, files.length - acceptedItems.length)
      uploadProgress.value = 100
      uploadStatusText.value = acceptedItems.length ? '已加入处理队列' : '无有效图片'

      await options.onQueued?.()
      return { succeeded: acceptedItems.length, failed: 0, timedOut: 0, rejected }
    } finally {
      if (version === uploadVersion) {
        await new Promise(resolve => setTimeout(resolve, 300))
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
      if (!response.ok) throw await responseError(response, '设置封面失败，请重试。')
      await reload()
    } catch (cause) {
      photos.value = previous
      throw cause
    }
  }

  async function deletePhoto(photoId: string) {
    const response = await apiFetch(`/api/photos/${photoId}`, { method: 'DELETE' })
    if (!response.ok) throw await responseError(response, '删除照片失败，请重试。')
    await reload()
  }

  async function deletePhotos(photoIds: string[]): Promise<{ succeeded: number; failed: number }> {
    if (!photoIds.length) return { succeeded: 0, failed: 0 }
    const results = await Promise.allSettled(
      photoIds.map(id => apiFetch(`/api/photos/${id}`, { method: 'DELETE' }))
    )
    let succeeded = 0
    let failed = 0
    results.forEach(res => {
      if (res.status === 'fulfilled' && res.value.ok) succeeded++
      else failed++
    })
    await reload()
    return { succeeded, failed }
  }

  async function updatePhotoTitle(photoId: string, title: string) {
    const response = await apiFetch(`/api/photos/${photoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    })
    if (!response.ok) throw await responseError(response, '更新标题失败，请重试。')
    await reload()
  }

  async function movePhoto(photoId: string, direction: 'up' | 'down') {
    const previous = photos.value
    const currentList = [...previous]
    const index = currentList.findIndex(p => p.id === photoId)
    if (index === -1) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= currentList.length) return

    const [moved] = currentList.splice(index, 1)
    currentList.splice(targetIndex, 0, moved)

    // Only persist the two swapped positions to avoid N-way partial writes.
    const a = currentList[index]
    const b = currentList[targetIndex]
    const updates = [
      { id: a.id, sortOrder: index },
      { id: b.id, sortOrder: targetIndex }
    ]
    photos.value = currentList.map((p, idx) => ({ ...p, sortOrder: idx }))

    try {
      const results = await Promise.all(
        updates.map(u =>
          apiFetch(`/api/photos/${u.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sortOrder: u.sortOrder })
          })
        )
      )
      const failed = results.find(response => !response.ok)
      if (failed) {
        throw await responseError(failed, '调整照片排序失败，请重试。')
      }
      await reload()
    } catch (cause) {
      // One of the two PATCHes may have succeeded; reload to match persisted order.
      photos.value = previous
      await reload().catch(() => {
        // Keep optimistic rollback if reload also fails.
      })
      throw cause
    }
  }

  async function setPublished(publish: boolean) {
    const galleryIdValue = id.value
    if (!galleryIdValue || publishing.value) return
    publishing.value = true
    try {
      const response = await apiFetch(`/api/galleries/${galleryIdValue}/${publish ? 'publish' : 'unpublish'}`, { method: 'POST' })
      if (!response.ok) throw await responseError(response, publish ? '发布展厅失败，请重试。' : '撤回发布失败，请重试。')
      const updated = response.status === 204 ? null : await response.json().catch(() => null) as Gallery | null
      if (updated && gallery.value?.id === galleryIdValue) gallery.value = updated
      await reload()
      return updated || gallery.value
    } finally {
      publishing.value = false
    }
  }

  function publish() {
    return setPublished(true)
  }

  function unpublish() {
    return setPublished(false)
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
    publishing,
    publish,
    unpublish,
    reload,
    uploadFiles,
    setCover,
    deletePhoto,
    deletePhotos,
    updatePhotoTitle,
    movePhoto
  }
}
