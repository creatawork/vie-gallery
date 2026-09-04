import { ref, computed, type Ref } from 'vue'
import { PublicApiClient, PublicApiError } from '../api/client'
import type { PublicGalleryResponse, PublicPhoto } from '../types/api'

/**
 * Viewer 状态
 */
export type ViewerState =
  | 'loading'           // 加载中
  | 'ready'             // 可以查看
  | 'password_prompt'   // 需要输入密码
  | 'share_required'    // 需要分享链接
  | 'empty'             // 相册为空
  | 'not_found'         // 相册不存在
  | 'error'             // 其他错误

/**
 * Viewer 状态机
 */
export function useViewerState(slug: string) {
  const client = new PublicApiClient()

  // 状态
  const state = ref<ViewerState>('loading')
  const gallery = ref<PublicGalleryResponse | null>(null)
  const photos = ref<PublicPhoto[]>([])
  const error = ref<string | null>(null)
  const unlocking = ref(false)

  // 计算属性
  const isReady = computed(() => state.value === 'ready')
  const needsPassword = computed(() => state.value === 'password_prompt')
  const needsShareLink = computed(() => state.value === 'share_required')
  const isEmpty = computed(() => state.value === 'empty')
  const hasError = computed(() => state.value === 'error' || state.value === 'not_found')

  /**
   * 初始化：获取相册状态
   */
  async function initialize() {
    state.value = 'loading'
    error.value = null

    try {
      gallery.value = await client.getGallery(slug)

      // 根据访问状态转换到对应的 viewer 状态
      switch (gallery.value.accessState) {
        case 'READY':
          state.value = 'ready'
          await loadPhotos()
          break
        case 'PASSWORD_REQUIRED':
          state.value = 'password_prompt'
          break
        case 'SHARE_LINK_REQUIRED':
          state.value = 'share_required'
          error.value = 'This gallery requires a share link to access'
          break
        case 'EMPTY':
          state.value = 'empty'
          break
      }
    } catch (err) {
      if (err instanceof PublicApiError) {
        if (err.isNotFound) {
          state.value = 'not_found'
          error.value = 'Gallery not found'
        } else if (err.isShareLinkRequired) {
          state.value = 'share_required'
          error.value = err.message
        } else {
          state.value = 'error'
          error.value = err.message
        }
      } else {
        state.value = 'error'
        error.value = 'Failed to load gallery'
      }
    }
  }

  /**
   * 解锁密码相册
   */
  async function unlock(password: string): Promise<boolean> {
    if (unlocking.value) return false

    unlocking.value = true
    error.value = null

    try {
      await client.unlock(slug, password)
      state.value = 'ready'
      await loadPhotos()
      return true
    } catch (err) {
      if (err instanceof PublicApiError) {
        if (err.isPasswordInvalid) {
          error.value = 'Invalid password'
        } else if (err.isRateLimited) {
          error.value = 'Too many attempts. Please try again later.'
        } else {
          error.value = err.message
        }
      } else {
        error.value = 'Failed to unlock gallery'
      }
      return false
    } finally {
      unlocking.value = false
    }
  }

  /**
   * 加载照片
   */
  async function loadPhotos(page: number = 0, pageSize: number = 50) {
    try {
      const response = await client.getPhotos(slug, page, pageSize)
      photos.value = response.items

      // 如果加载后发现为空，更新状态
      if (photos.value.length === 0 && state.value === 'ready') {
        state.value = 'empty'
      }
    } catch (err) {
      if (err instanceof PublicApiError) {
        // Session 过期，需要重新解锁
        if (err.code === 'PUBLIC_SESSION_EXPIRED') {
          state.value = 'password_prompt'
          error.value = 'Session expired. Please unlock again.'
        } else {
          error.value = err.message
        }
      } else {
        error.value = 'Failed to load photos'
      }
      throw err
    }
  }

  /**
   * 重试
   */
  async function retry() {
    await initialize()
  }

  return {
    // 状态
    state,
    gallery,
    photos,
    error,
    unlocking,

    // 计算属性
    isReady,
    needsPassword,
    needsShareLink,
    isEmpty,
    hasError,

    // 方法
    initialize,
    unlock,
    loadPhotos,
    retry
  }
}

/**
 * Viewer 状态机类型
 */
export type ViewerStateComposable = ReturnType<typeof useViewerState>
