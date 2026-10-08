import { computed, ref, toRaw } from 'vue'
import { parseViewerConfig, type ViewerConfig } from '@vie/gallery-contracts'
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

function markStartupStage(stage: string) {
  if (typeof performance !== 'undefined') performance.mark(`viewer:${stage}`)
}

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

export function useViewerState(slug: string, options: { isPreviewEmbed?: () => boolean } = {}) {
  const client = new PublicApiClient()
  markStartupStage('entry')
  const state = ref<ViewerState>('loading')
  const gallery = ref<PublicGalleryResponse | null>(null)
  const photos = ref<PublicPhoto[]>([])
  const error = ref<string | null>(null)
  const unlocking = ref(false)
  const currentPage = ref(0)
  const pageSize = ref(50)
  const total = ref(0)
  const loadingMore = ref(false)
  const viewerConfig = ref<ViewerConfig | null>(null)
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
  let latestPreviewConfig: ViewerConfig | undefined
  let configSnapshot: ViewerConfig | undefined
  let resolvePreviewBootstrap!: (config: ViewerConfig) => void
  const previewBootstrap = new Promise<ViewerConfig>(resolve => { resolvePreviewBootstrap = resolve })

  function waitForPreviewBootstrap(version: number): Promise<ViewerConfig | null> {
    return new Promise(resolve => {
      const timer = window.setTimeout(() => resolve(null), 350)
      previewBootstrap.then(config => {
        window.clearTimeout(timer)
        resolve(version === requestVersion ? config : null)
      })
    })
  }

  function beginLoad() {
    // Public entries still read the server on every load. Preview cycles seed
    // their own snapshot from the latest draft, before access state is cleared.
    if (latestPreviewConfig && viewerConfig.value) latestPreviewConfig = structuredClone(toRaw(viewerConfig.value))
    configSnapshot = latestPreviewConfig ? structuredClone(latestPreviewConfig) : undefined
    return ++requestVersion
  }

  async function loadConfig(version = requestVersion): Promise<ViewerConfig | null> {
    if (configSnapshot === undefined && options.isPreviewEmbed?.()) {
      const bootstrap = await waitForPreviewBootstrap(version)
      if (version !== requestVersion) return null
      if (bootstrap) {
        markStartupStage('config-ready')
        return bootstrap
      }
    }
    if (configSnapshot !== undefined) {
      markStartupStage('config-ready')
      return structuredClone(configSnapshot)
    }
    try {
      const cfg = await client.getViewerConfig(slug)
      markStartupStage('config-ready')
      if (version !== requestVersion) return null
      const serverConfig = cfg?.configJson ? parseViewerConfig(cfg.configJson, cfg.schemaVersion ?? 1, 'legacy').config : null
      return structuredClone(configSnapshot ?? serverConfig)
    } catch (cause) {
      markStartupStage('config-ready')
      if (version !== requestVersion) return null
      if (configSnapshot !== undefined && !(cause instanceof PublicApiError && (cause.isSessionExpired || cause.isPasswordRequired || cause.status === 403))) {
        return structuredClone(configSnapshot)
      }
      if (cause instanceof PublicApiError && (cause.isSessionExpired || cause.isPasswordRequired || cause.status === 403)) throw cause
      return null
    }
  }
  function setConfigSnapshot(config: ViewerConfig): boolean {
    configSnapshot = structuredClone(config)
    latestPreviewConfig = structuredClone(config)
    viewerConfig.value = structuredClone(config)
    resolvePreviewBootstrap(structuredClone(config))
    return true
  }
  function setAppliedConfigSnapshot(config: ViewerConfig) {
    latestPreviewConfig = structuredClone(config)
    viewerConfig.value = structuredClone(config)
  }
  async function loadFirstPage(version: number) {
    const [config, response] = await Promise.all([
      loadConfig(version),
      client.getPhotos(slug, 0, pageSize.value).then(result => {
        markStartupStage('photos-ready')
        return result
      })
    ])
    if (version !== requestVersion) return
    viewerConfig.value = latestPreviewConfig ? structuredClone(latestPreviewConfig) : config
    photos.value = response.items
    currentPage.value = response.page
    pageSize.value = response.pageSize
    total.value = response.total
    state.value = response.total === 0 ? 'empty' : 'ready'
  }
  function clearAccess() { viewerConfig.value = null; photos.value = []; total.value = 0; gallery.value = null }

  async function loadEmptyGallery(version: number) {
    const config = await loadConfig(version)
    if (version !== requestVersion) return
    viewerConfig.value = latestPreviewConfig ? structuredClone(latestPreviewConfig) : config
    state.value = 'empty'
  }

  async function initialize() {
    const version = beginLoad()
    clearAccess()
    state.value = 'loading'
    error.value = null
    photos.value = []
    currentPage.value = 0
    total.value = 0

    try {
      const nextGallery = await client.getGallery(slug)
      if (version !== requestVersion) return
      gallery.value = nextGallery
      markStartupStage('access-ready')

      switch (nextGallery.accessState) {
        case 'READY':
          await loadFirstPage(version)
          break
        case 'PASSWORD_REQUIRED':
          state.value = 'password_prompt'
          break
        case 'SHARE_LINK_REQUIRED':
          state.value = 'share_required'
          error.value = '此空间需要有效的分享链接才能访问。'
          break
        case 'EMPTY':
          await loadEmptyGallery(version)
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
    const version = beginLoad()
    viewerConfig.value = null
    unlocking.value = true
    error.value = null
    try {
      await client.unlock(slug, password)
      const nextGallery = await client.getGallery(slug)
      if (version !== requestVersion) return false
      gallery.value = nextGallery
      markStartupStage('access-ready')
      if (nextGallery.accessState === 'READY') {
        await loadFirstPage(version)
      } else if (nextGallery.accessState === 'EMPTY') {
        await loadEmptyGallery(version)
        if (version !== requestVersion) return false
      } else {
        state.value = nextGallery.accessState === 'PASSWORD_REQUIRED' ? 'password_prompt' : 'share_required'
      }
      return state.value === 'ready' || state.value === 'empty'
    } catch (cause) {
      if (version !== requestVersion) return false
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
    const version = requestVersion
    loadingMore.value = true
    error.value = null
    try {
      await loadPhotos(currentPage.value + 1, pageSize.value, version)
    } catch (cause) {
      if (version !== requestVersion) return
      // Loading another page must not replace an already usable gallery with a
      // full-screen error. Keep the ready state and expose a retryable message.
      if (cause instanceof PublicApiError && (cause.isSessionExpired || cause.isPasswordRequired || cause.status === 403)) {
        requestVersion++; clearAccess(); handleError(cause, '访问已失效，请重新解锁。'); return
      }
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
      if (cause.isSessionExpired || cause.isPasswordRequired) {
        clearAccess()
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
    setConfigSnapshot,
    setAppliedConfigSnapshot,
    allowDownload,
    initialize,
    unlock,
    loadPhotos,
    loadMore,
    retry
  }
}

export type ViewerStateComposable = ReturnType<typeof useViewerState>
