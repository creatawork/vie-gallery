import { computed, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import type { Gallery } from '@vie/gallery-contracts'
import { apiFetch, uploadFileWithProgress } from '../api'
import { StatusError, responseError } from '../lib/apiError'

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
  originalUrl?: string
}

export type WorkspaceErrorKind = 'unauthorized' | 'forbidden' | 'not-found' | 'network' | 'unknown'

export interface WorkspaceError {
  kind: WorkspaceErrorKind
  message: string
  status?: number
}

export interface UploadFileResult {
  file: File
  ok: boolean
  photoId?: string
  taskId?: string
  errorCode?: string
  message?: string
}

export interface UploadSummary {
  succeeded: number
  failed: number
  timedOut: number
  rejected: number
  results: UploadFileResult[]
}

const UPLOAD_CONCURRENCY = 3

interface UploadItem {
  filename?: string | null
  accepted?: boolean
  photoId?: string | null
  taskId?: string | null
  status?: string
  error?: { code?: string | null; message?: string | null } | null
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

  async function loadPhotos(galleryIdValue: string) {
    const response = await apiFetch(`/api/galleries/${galleryIdValue}/photos`)
    if (!response.ok) throw await responseError(response, '照片列表加载失败，请稍后重试。')
    const data = await response.json() as WorkspacePhoto[]
    return data.map(photo => ({
      ...photo,
      title: photo.title || undefined,
      thumbnailUrl: photo.thumbnailUrl || undefined,
      width: photo.width || undefined,
      height: photo.height || undefined
    }))
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
      const [found, loadedPhotos] = await Promise.all([
        apiFetch(`/api/galleries/${galleryIdValue}`).then(async response => {
          if (!response.ok) throw await responseError(response, '展厅信息加载失败，请稍后重试。')
          return await response.json() as Gallery
        }),
        loadPhotos(galleryIdValue)
      ])
      // Commit together, so a failed or superseded load cannot restore stale photos.
      if (isCurrent(version)) {
        gallery.value = found
        photos.value = loadedPhotos
      }
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
    if (!galleryIdValue || !files.length) {
      return { succeeded: 0, failed: 0, timedOut: 0, rejected: 0, results: [] }
    }

    const version = ++uploadVersion
    const list = Array.from(files)
    const batchId = options.batchId ?? crypto.randomUUID()
    const totalBytes = list.reduce((sum, file) => sum + file.size, 0) || 1
    const uploadedBytes = new Array<number>(list.length).fill(0)
    const results: UploadFileResult[] = []

    uploading.value = true
    uploadProgress.value = 0
    uploadStatusText.value = `正在上传 0/${list.length} 张…`

    const reportProgress = () => {
      if (version !== uploadVersion) return
      const done = uploadedBytes.reduce((sum, value) => sum + value, 0)
      uploadProgress.value = Math.min(99, Math.round((done / totalBytes) * 100))
      uploadStatusText.value = `正在上传 ${results.length}/${list.length} 张…`
    }

    // 逐文件上传：单个请求只带一张图，避免大批量塞进一个请求触发超时，
    // 也让进度条反映真实字节数、单张失败不影响其余文件。
    let cursor = 0
    async function worker() {
      while (cursor < list.length && version === uploadVersion) {
        const index = cursor++
        const file = list[index]
        const form = new FormData()
        form.append('files', file)
        try {
          const response = await uploadFileWithProgress(`/api/galleries/${galleryIdValue}/photos`, form, {
            headers: {
              'X-Client-Batch-Id': batchId,
              'Idempotency-Key': crypto.randomUUID()
            },
            onProgress: loaded => {
              uploadedBytes[index] = loaded
              reportProgress()
            }
          })
          if (!response.ok) throw await responseError(response, '照片上传失败，请重试。')
          const payload = await response.json() as { items?: UploadItem[] }
          const item = (payload.items ?? [])[0]
          if (item && item.accepted === false) {
            results.push({
              file,
              ok: false,
              errorCode: item.error?.code || 'REJECTED',
              message: item.error?.message || '文件未被接受'
            })
          } else {
            results.push({ file, ok: true, photoId: item?.photoId ?? undefined, taskId: item?.taskId ?? undefined })
            uploadedBytes[index] = file.size
          }
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : '照片上传失败，请重试。'
          results.push({ file, ok: false, errorCode: message.includes('超时') ? 'TIMEOUT' : 'NETWORK', message })
        }
        uploadedBytes[index] = Math.max(uploadedBytes[index], file.size)
        reportProgress()
      }
    }

    const workerCount = Math.min(UPLOAD_CONCURRENCY, list.length)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))

    const succeededResults = results.filter(result => result.ok)
    const failedResults = results.filter(result => !result.ok)
    if (version === uploadVersion) {
      uploadProgress.value = 100
      uploadStatusText.value = failedResults.length === 0 ? '已加入处理队列' : `${failedResults.length} 张上传失败`
    }

    try {
      await options.onQueued?.()
    } finally {
      if (version === uploadVersion) {
        await new Promise(resolve => setTimeout(resolve, 300))
        uploading.value = false
        uploadProgress.value = 0
        uploadStatusText.value = ''
      }
    }

    return {
      succeeded: succeededResults.length,
      failed: failedResults.length,
      timedOut: failedResults.filter(result => result.errorCode === 'TIMEOUT').length,
      rejected: failedResults.filter(result => result.errorCode !== 'TIMEOUT' && result.errorCode !== 'NETWORK').length,
      results
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

  /** 仅从本地列表移除（供"可撤销删除"的乐观更新使用），不影响服务端。 */
  function removePhotoLocally(photoId: string) {
    photos.value = photos.value.filter(photo => photo.id !== photoId)
  }

  function restorePhotoLocally(photo: WorkspacePhoto, index: number) {
    const next = [...photos.value]
    next.splice(Math.min(Math.max(0, index), next.length), 0, photo)
    photos.value = next
  }

  async function deletePhotos(photoIds: string[]): Promise<{ succeeded: number; failed: number }> {
    if (!photoIds.length) return { succeeded: 0, failed: 0 }
    const galleryIdValue = id.value
    if (!galleryIdValue) throw new Error('展厅未找到')
    const response = await apiFetch(`/api/galleries/${galleryIdValue}/photos/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds })
    })
    if (!response.ok) throw await responseError(response, '批量删除照片失败，请重试。')
    const data = await response.json() as { requested?: number; deleted?: number }
    const deleted = Number(data.deleted ?? 0)
    const requested = Number(data.requested ?? photoIds.length)
    await reload()
    return { succeeded: deleted, failed: Math.max(0, requested - deleted) }
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

  async function reorderPhotos(orderedPhotoIds: string[]) {
    if (!orderedPhotoIds.length) return
    const previous = photos.value
    const byId = new Map(previous.map(photo => [photo.id, photo] as const))
    const reordered = orderedPhotoIds
      .map(photoId => byId.get(photoId))
      .filter((photo): photo is WorkspacePhoto => !!photo)
    const rest = previous.filter(photo => !orderedPhotoIds.includes(photo.id))
    photos.value = [...reordered, ...rest].map((photo, index) => ({ ...photo, sortOrder: index }))
    try {
      const response = await apiFetch(`/api/galleries/${id.value}/photos/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedPhotoIds })
      })
      if (!response.ok) throw await responseError(response, '调整照片排序失败，请重试。')
    } catch (cause) {
      photos.value = previous
      throw cause
    }
  }

  async function movePhoto(photoId: string, direction: 'up' | 'down') {
    const currentList = [...photos.value]
    const index = currentList.findIndex(p => p.id === photoId)
    if (index === -1) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= currentList.length) return

    const orderedIds = currentList.map(p => p.id)
    const [moved] = orderedIds.splice(index, 1)
    orderedIds.splice(targetIndex, 0, moved)
    await reorderPhotos(orderedIds)
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
    removePhotoLocally,
    restorePhotoLocally,
    updatePhotoTitle,
    movePhoto,
    reorderPhotos
  }
}
