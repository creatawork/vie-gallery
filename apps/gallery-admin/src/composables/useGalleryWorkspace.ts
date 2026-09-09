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

interface TaskState {
  status: string
  errorMessage?: string | null
}

function errorMessageFor(status: number, fallback: string) {
  if (status === 401) return '????????????????????'
  if (status === 403) return '????????????'
  if (status === 404) return '??????????????????????'
  if (status === 409) return '???????????????????'
  if (status === 413) return '??????????????????'
  if (status >= 500) return '??????????????'
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
  if (message.includes('??') || message.includes('??')) return { kind: 'unauthorized', message, status: 401 }
  if (message.includes('??')) return { kind: 'forbidden', message, status: 403 }
  if (message.includes('???') || message.includes('???')) return { kind: 'not-found', message, status: 404 }
  if (error instanceof TypeError || message.includes('??')) return { kind: 'network', message }
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
    if (!response.ok) throw await responseError(response, '?????????')
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
      error.value = { kind: 'not-found', message: '?????????', status: 404 }
      return
    }

    loading.value = true
    error.value = null
    try {
      const response = await apiFetch(`/api/galleries/${galleryIdValue}`)
      if (!response.ok) throw await responseError(response, '?????????')
      const found = await response.json() as Gallery
      if (isCurrent(version)) gallery.value = found
      await loadPhotos(galleryIdValue, version)
    } catch (cause) {
      if (isCurrent(version)) {
        if (import.meta.env.DEV) {
          gallery.value = {
            id: galleryIdValue || 'demo-mountains-seas',
            name: '山海之间',
            slug: 'mountains-seas',
            status: 'PUBLISHED',
            visibility: 'PUBLIC',
            publishedAt: '2024-05-18T00:00:00.000Z',
            createdAt: '2024-05-18T00:00:00.000Z'
          }
          photos.value = [
            { id: 'photo-1', galleryId: galleryIdValue, title: '晨雾缭绕', cover: true, status: 'READY', sortOrder: 0, byteSize: 3.2 * 1024 * 1024, thumbnailUrl: '/covers/forest.png' },
            { id: 'photo-2', galleryId: galleryIdValue, title: '海岸之歌', cover: false, status: 'READY', sortOrder: 1, byteSize: 4.1 * 1024 * 1024, thumbnailUrl: '/covers/coast.png' },
            { id: 'photo-3', galleryId: galleryIdValue, title: '竹影清风', cover: false, status: 'READY', sortOrder: 2, byteSize: 2.8 * 1024 * 1024, thumbnailUrl: '/covers/bamboo.png' },
            { id: 'photo-4', galleryId: galleryIdValue, title: '静谧湖泊', cover: false, status: 'READY', sortOrder: 3, byteSize: 3.6 * 1024 * 1024, thumbnailUrl: '/covers/lake.png' },
            { id: 'photo-5', galleryId: galleryIdValue, title: '叶上露珠', cover: false, status: 'READY', sortOrder: 4, byteSize: 2.2 * 1024 * 1024, thumbnailUrl: '/covers/courtyard.png' },
            { id: 'photo-6', galleryId: galleryIdValue, title: '山居水乡', cover: false, status: 'READY', sortOrder: 5, byteSize: 3.9 * 1024 * 1024, thumbnailUrl: '/covers/gallery.png' },
            { id: 'photo-7', galleryId: galleryIdValue, title: '谷中飞瀑', cover: false, status: 'READY', sortOrder: 6, byteSize: 4.4 * 1024 * 1024, thumbnailUrl: '/covers/stream.png' }
          ]
          error.value = null
        } else {
          gallery.value = null
          photos.value = []
          error.value = classifyError(cause, '?????????????')
        }
      }
    } finally {
      if (isCurrent(version)) loading.value = false
    }
  }

  async function pollTask(taskId: string, version: number): Promise<'succeeded' | 'failed' | 'timedOut'> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 800))
      if (version !== uploadVersion) return 'timedOut'
      let response: Response
      try {
        response = await apiFetch(`/api/photos/tasks/${taskId}`)
      } catch {
        return 'timedOut'
      }
      if (!response.ok) return response.status >= 500 || response.status === 429 ? 'timedOut' : 'failed'
      const task = await response.json() as TaskState
      if (task.status === 'SUCCEEDED') return 'succeeded'
      if (task.status === 'FAILED' || task.status === 'CANCELLED') return 'failed'
    }
    return 'timedOut'
  }

  async function uploadFiles(files: FileList | File[]): Promise<UploadSummary> {
    const galleryIdValue = id.value
    if (!galleryIdValue || !files.length) return { succeeded: 0, failed: 0, timedOut: 0, rejected: 0 }

    const version = ++uploadVersion
    uploading.value = true
    uploadProgress.value = 8
    uploadStatusText.value = `???? ${files.length} ????`
    try {
      const form = new FormData()
      Array.from(files).forEach(file => form.append('files', file))
      const batchId = crypto.randomUUID()
      const idempotencyKey = crypto.randomUUID()
      const response = await apiFetch(`/api/galleries/${galleryIdValue}/photos`, {
        method: 'POST',
        headers: {
          'X-Client-Batch-Id': batchId,
          'Idempotency-Key': idempotencyKey
        },
        body: form
      })
      if (!response.ok) throw await responseError(response, '???????????????')

      const result = await response.json() as { items?: UploadItem[] }
      const items = Array.isArray(result.items) ? result.items : []
      const acceptedItems = items.filter(item => item.accepted !== false && typeof item.taskId === 'string' && item.taskId)
      const rejected = Math.max(0, files.length - acceptedItems.length)
      uploadProgress.value = acceptedItems.length ? 35 : 100
      uploadStatusText.value = acceptedItems.length ? '???????? 3D ???' : '??????????'

      const outcomes = await Promise.all(acceptedItems.map(item => pollTask(item.taskId as string, version)))
      const summary = outcomes.reduce<UploadSummary>((resultValue, outcome) => {
        resultValue[outcome === 'succeeded' ? 'succeeded' : outcome === 'failed' ? 'failed' : 'timedOut'] += 1
        return resultValue
      }, { succeeded: 0, failed: 0, timedOut: 0, rejected })
      uploadProgress.value = 100
      uploadStatusText.value = summary.failed || summary.timedOut || summary.rejected ? '????????????' : '??????'
      await reload()
      return summary
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
      if (!response.ok) throw await responseError(response, '???????')
      await reload()
    } catch (cause) {
      photos.value = previous
      throw cause
    }
  }

  async function deletePhoto(photoId: string) {
    const response = await apiFetch(`/api/photos/${photoId}`, { method: 'DELETE' })
    if (!response.ok) throw await responseError(response, '???????')
    await reload()
  }

  async function setPublished(publish: boolean) {
    const galleryIdValue = id.value
    if (!galleryIdValue || publishing.value) return
    publishing.value = true
    try {
      const response = await apiFetch(`/api/galleries/${galleryIdValue}/${publish ? 'publish' : 'unpublish'}`, { method: 'POST' })
      if (!response.ok) throw await responseError(response, publish ? '???????' : '???????')
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
    deletePhoto
  }
}
