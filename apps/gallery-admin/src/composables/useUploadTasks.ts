import { computed, onMounted, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { apiFetch } from '../api'

export type UploadTaskStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | string

export interface UploadTaskError {
  code?: string | null
  message?: string | null
  requestId?: string | null
}

export interface UploadTask {
  id: string
  galleryId?: string
  photoId?: string | null
  filename?: string | null
  thumbnailUrl?: string | null
  photoThumbnailUrl?: string | null
  status: UploadTaskStatus
  progress: number
  stage?: string | null
  attempts: number
  maxAttempts: number
  retryable: boolean
  error?: UploadTaskError | null
  errorCode?: string | null
  errorMessage?: string | null
  requestId?: string | null
  createdAt?: string | null
  startedAt?: string | null
  updatedAt?: string | null
  finishedAt?: string | null
}

export interface UploadTaskSummary {
  queued: number
  processing: number
  succeeded: number
  failed: number
  cancelRequested: number
  cancelled: number
}

export type TaskFilter = 'ALL' | 'ACTIVE' | 'FAILED' | 'COMPLETED'

const ACTIVE_STATUSES: UploadTaskStatus[] = ['QUEUED', 'PROCESSING', 'CANCEL_REQUESTED']

function emptySummary(): UploadTaskSummary {
  return { queued: 0, processing: 0, succeeded: 0, failed: 0, cancelRequested: 0, cancelled: 0 }
}

function normalizeError(value: unknown, raw: Record<string, unknown>): UploadTaskError | null {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : raw.errorCode || raw.errorMessage
    ? { code: raw.errorCode, message: raw.errorMessage, requestId: raw.requestId }
    : null
  if (!source) return null
  return {
    code: typeof source.code === 'string' ? source.code : null,
    message: typeof source.message === 'string' ? source.message : null,
    requestId: typeof source.requestId === 'string' ? source.requestId : null
  }
}

function normalizeTask(value: unknown): UploadTask {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const progress = Number(raw.progress)
  const attempts = Number(raw.attempts)
  const maxAttempts = Number(raw.maxAttempts)
  const status = typeof raw.status === 'string' ? raw.status : 'QUEUED'
  const error = normalizeError(raw.error, raw)
  return {
    id: String(raw.id || raw.taskId || ''),
    galleryId: typeof raw.galleryId === 'string' ? raw.galleryId : undefined,
    photoId: typeof raw.photoId === 'string' ? raw.photoId : null,
    filename: typeof raw.filename === 'string' ? raw.filename : null,
    thumbnailUrl: typeof raw.thumbnailUrl === 'string' ? raw.thumbnailUrl : null,
    photoThumbnailUrl: typeof raw.photoThumbnailUrl === 'string' ? raw.photoThumbnailUrl : null,
    status,
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0,
    stage: typeof raw.stage === 'string' ? raw.stage : null,
    attempts: Number.isFinite(attempts) ? attempts : 0,
    maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : 3,
    retryable: raw.retryable === true || (status === 'FAILED' && attempts < maxAttempts),
    error,
    errorCode: error?.code || null,
    errorMessage: error?.message || null,
    requestId: error?.requestId || (typeof raw.requestId === 'string' ? raw.requestId : null),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : null
  }
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  let message = fallback
  try {
    const body = await response.json() as { message?: string }
    if (body.message) message = body.message
  } catch {
    // Keep the friendly fallback for non-JSON responses.
  }
  const error = new Error(message)
  Object.assign(error, { status: response.status })
  return error
}

export function useUploadTasks(
  galleryId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean> = true
) {
  const id = computed(() => toValue(galleryId))
  const isEnabled = computed(() => toValue(enabled))
  const tasks = ref<UploadTask[]>([])
  const summary = ref<UploadTaskSummary>(emptySummary())
  const filter = ref<TaskFilter>('ALL')
  const loading = ref(true)
  const refreshing = ref(false)
  const error = ref<Error | null>(null)
  const isPolling = ref(false)

  let requestVersion = 0
  let pollTimer: number | undefined
  let pollInFlight = false

  const activeTasks = computed(() => tasks.value.filter(task => ACTIVE_STATUSES.includes(task.status)))
  const filteredTasks = computed(() => tasks.value.filter(task => {
    if (filter.value === 'ACTIVE') return ACTIVE_STATUSES.includes(task.status)
    if (filter.value === 'FAILED') return task.status === 'FAILED'
    if (filter.value === 'COMPLETED') return ['SUCCEEDED', 'CANCELLED'].includes(task.status)
    return true
  }))

  function clearPoll() {
    if (pollTimer !== undefined) window.clearTimeout(pollTimer)
    pollTimer = undefined
    isPolling.value = false
  }

  function schedulePoll(delay = document.hidden ? 8000 : 2500) {
    clearPoll()
    if (!isEnabled.value || !activeTasks.value.length) return
    isPolling.value = true
    pollTimer = window.setTimeout(async () => {
      pollTimer = undefined
      await load(true)
      schedulePoll()
    }, delay)
  }

  async function load(silent = false): Promise<void> {
    const galleryIdValue = id.value
    const version = ++requestVersion
    if (!isEnabled.value || !galleryIdValue) {
      clearPoll()
      tasks.value = []
      summary.value = emptySummary()
      loading.value = false
      refreshing.value = false
      error.value = null
      return
    }
    if (pollInFlight) return
    pollInFlight = true
    if (silent) refreshing.value = true
    else loading.value = true
    error.value = null
    try {
      const query = new URLSearchParams({
        status: 'QUEUED,PROCESSING,CANCEL_REQUESTED,FAILED,SUCCEEDED,CANCELLED',
        page: '0',
        pageSize: '100'
      })
      const response = await apiFetch(`/api/galleries/${encodeURIComponent(galleryIdValue)}/photo-tasks?${query}`)
      if (!response.ok) throw await responseError(response, '任务列表加载失败，请稍后重试。')
      const data = await response.json() as { items?: unknown[]; summary?: Partial<UploadTaskSummary> } | unknown[]
      if (version !== requestVersion) return
      const items = Array.isArray(data) ? data : data.items || []
      tasks.value = items.map(normalizeTask).filter(task => task.id)
      const remoteSummary = Array.isArray(data) ? undefined : data.summary
      summary.value = {
        queued: Number(remoteSummary?.queued ?? tasks.value.filter(task => task.status === 'QUEUED').length),
        processing: Number(remoteSummary?.processing ?? tasks.value.filter(task => task.status === 'PROCESSING').length),
        succeeded: Number(remoteSummary?.succeeded ?? tasks.value.filter(task => task.status === 'SUCCEEDED').length),
        failed: Number(remoteSummary?.failed ?? tasks.value.filter(task => task.status === 'FAILED').length),
        cancelRequested: Number(remoteSummary?.cancelRequested ?? tasks.value.filter(task => task.status === 'CANCEL_REQUESTED').length),
        cancelled: Number(remoteSummary?.cancelled ?? tasks.value.filter(task => task.status === 'CANCELLED').length)
      }
    } catch (cause) {
      if (version === requestVersion) error.value = cause instanceof Error ? cause : new Error('任务列表加载失败，请稍后重试。')
    } finally {
      pollInFlight = false
      if (version === requestVersion) {
        loading.value = false
        refreshing.value = false
        schedulePoll()
      }
    }
  }

  async function retry(task: UploadTask) {
    if (task.status !== 'FAILED' || !task.retryable) return
    const response = await apiFetch(`/api/photos/tasks/${encodeURIComponent(task.id)}/retry`, { method: 'POST' })
    if (!response.ok) throw await responseError(response, '任务重试失败，请稍后重试。')
    await load(true)
  }

  async function cancel(task: UploadTask) {
    if (!['QUEUED', 'PROCESSING'].includes(task.status)) return
    const response = await apiFetch(`/api/photos/tasks/${encodeURIComponent(task.id)}/cancel`, { method: 'POST' })
    if (!response.ok) throw await responseError(response, '取消任务失败，请稍后重试。')
    await load(true)
  }

  function handleVisibilityChange() {
    if (!document.hidden) void load(true)
    else schedulePoll()
  }

  watch([id, isEnabled], () => void load(), { immediate: true })
  onMounted(() => document.addEventListener('visibilitychange', handleVisibilityChange))
  onUnmounted(() => {
    requestVersion += 1
    clearPoll()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return {
    tasks,
    filteredTasks,
    activeTasks,
    summary,
    filter,
    loading,
    refreshing,
    error,
    isPolling,
    load,
    retry,
    cancel
  }
}
