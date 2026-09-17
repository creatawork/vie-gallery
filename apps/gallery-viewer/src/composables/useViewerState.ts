import { computed, ref } from 'vue'
import { PublicApiClient, PublicApiError } from '../api/client'
import type { PublicGalleryResponse, PublicPhoto, PublicPhotoPage } from '../types/api'

export type ViewerState =
  | 'loading'
  | 'ready'
  | 'password_prompt'
  | 'share_required'
  | 'empty'
  | 'not_found'
  | 'error'

function userMessage(error: PublicApiError, fallback: string) {
  if (error.isNotFound) return '找不到这个相册空间，可能已被移除或链接有误。'
  if (error.isPasswordInvalid) return '密码不正确，请重新输入。'
  if (error.isSessionExpired) return '访问会话已过期，请重新输入密码。'
  if (error.isShareLinkRequired || error.status === 403) return '此空间需要有效的分享链接才能访问。'
  if (error.isRateLimited) return '尝试次数过多，请稍后再试。'
  if (error.isNetworkError) return '网络连接异常，请检查网络后重试。'
  if (error.status === 400 || error.status === 422) return '请求参数有误，请稍后重试。'
  if (error.status >= 500) return '服务暂时不可用，请稍后重试。'
  return fallback
}

export function useViewerState(slug: string) {
  const client = new PublicApiClient()
  const state = ref<ViewerState>('loading')
  const gallery = ref<PublicGalleryResponse | null>(null)
  const photos = ref<PublicPhoto[]>([])
  const error = ref<string | null>(null)
  const unlocking = ref(false)
  const currentPage = ref(0)
  const pageSize = ref(50)
  const total = ref(0)
  const loadingMore = ref(false)
  const viewerConfig = ref<Record<string, unknown> | null>(null)
  let requestVersion = 0

  const isReady = computed(() => state.value === 'ready')
  const isPublicReady = computed(() =>
    (isReady.value || isEmpty.value) && gallery.value?.accessState === 'READY' && gallery.value.visibility === 'PUBLIC'
  )
  const needsPassword = computed(() => state.value === 'password_prompt')
  const needsShareLink = computed(() => state.value === 'share_required')
  const isEmpty = computed(() => state.value === 'empty')
  const hasError = computed(() => state.value === 'error' || state.value === 'not_found')
  const hasMore = computed(() => photos.value.length < total.value)
  const allowDownload = computed(() => viewerConfig.value?.visitorAllowDownload === true)

  async function loadConfig() {
    try {
      const cfg = await client.getViewerConfig(slug)
      if (cfg?.configJson) {
        viewerConfig.value = JSON.parse(cfg.configJson)
      }
    } catch {
      // Configuration is optional or falls back to defaults
    }
  }

  async function initialize() {
    const version = ++requestVersion
    state.value = 'loading'
    error.value = null
    photos.value = []
    currentPage.value = 0
    total.value = 0

    try {
      const nextGallery = await client.getGallery(slug)
      if (version !== requestVersion) return
      gallery.value = nextGallery
      void loadConfig()

      switch (nextGallery.accessState) {
        case 'READY':
          await loadPhotos(0, pageSize.value, version)
          break
        case 'PASSWORD_REQUIRED':
          state.value = 'password_prompt'
          break
        case 'SHARE_LINK_REQUIRED':
          state.value = 'share_required'
          error.value = '此空间需要有效的分享链接才能访问。'
          break
        case 'EMPTY':
          state.value = 'empty'
          break
        default:
          state.value = 'error'
          error.value = '空间返回了无法识别的访问状态，请稍后重试。'
      }
    } catch (cause) {
      if (version !== requestVersion) return
      handleError(cause, '加载相册空间失败，请稍后重试。')
    }
  }

  async function unlock(password: string): Promise<boolean> {
    if (unlocking.value) return false
    unlocking.value = true
    error.value = null
    try {
      await client.unlock(slug, password)
      await loadPhotos(0, pageSize.value)
      return state.value === 'ready' || state.value === 'empty'
    } catch (cause) {
      handleError(cause, '解锁相册失败，请稍后重试。', true)
      return false
    } finally {
      unlocking.value = false
    }
  }

  async function loadPhotos(page = 0, requestedPageSize = pageSize.value, version = requestVersion) {
    const response: PublicPhotoPage = await client.getPhotos(slug, page, requestedPageSize)
    if (version !== requestVersion) return

    if (page === 0) photos.value = response.items
    else photos.value = [...photos.value, ...response.items]
    currentPage.value = response.page
    pageSize.value = response.pageSize
    total.value = response.total
    state.value = response.total === 0 ? 'empty' : 'ready'
  }

  async function loadMore() {
    if (loadingMore.value || !hasMore.value || state.value !== 'ready') return
    loadingMore.value = true
    error.value = null
    try {
      await loadPhotos(currentPage.value + 1, pageSize.value)
    } catch (cause) {
      // Loading another page must not replace an already usable gallery with a
      // full-screen error. Keep the ready state and expose a retryable message.
      if (cause instanceof PublicApiError) {
        error.value = userMessage(cause, '加载更多照片失败，请重试。')
      } else {
        error.value = '加载更多照片失败，请重试。'
      }
    } finally {
      loadingMore.value = false
    }
  }

  function handleError(cause: unknown, fallback: string, preservePasswordPrompt = false) {
    if (cause instanceof PublicApiError) {
      if (cause.isSessionExpired) {
        state.value = 'password_prompt'
        error.value = userMessage(cause, fallback)
        return
      }
      if (preservePasswordPrompt && (cause.isPasswordInvalid || cause.status === 401 || cause.status === 403)) {
        state.value = 'password_prompt'
      } else if (cause.isNotFound) {
        state.value = 'not_found'
      } else if (cause.isShareLinkRequired || cause.status === 403) {
        state.value = 'share_required'
      } else {
        state.value = 'error'
      }
      error.value = userMessage(cause, fallback)
      return
    }
    state.value = 'error'
    error.value = fallback
  }

  async function retry() {
    await initialize()
  }

  return {
    state,
    gallery,
    photos,
    error,
    unlocking,
    currentPage,
    pageSize,
    total,
    loadingMore,
    isReady,
    isPublicReady,
    needsPassword,
    needsShareLink,
    isEmpty,
    hasError,
    hasMore,
    viewerConfig,
    allowDownload,
    initialize,
    unlock,
    loadPhotos,
    loadMore,
    retry
  }
}

export type ViewerStateComposable = ReturnType<typeof useViewerState>
