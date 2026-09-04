/**
 * 公开访问状态
 */
export type PublicAccessState = 'READY' | 'PASSWORD_REQUIRED' | 'SHARE_LINK_REQUIRED' | 'EMPTY'

/**
 * 相册可见性
 */
export type GalleryVisibility = 'PUBLIC' | 'PRIVATE' | 'PASSWORD'

/**
 * 公开相册响应
 */
export interface PublicGalleryResponse {
  slug: string
  title: string
  visibility: GalleryVisibility
  accessState: PublicAccessState
  cover: {
    url: string
    width: number
    height: number
  } | null
  photoCount: number
}

/**
 * 解锁响应
 */
export interface UnlockResponse {
  unlocked: boolean
  expiresAt: string
}

/**
 * 公开照片
 */
export interface PublicPhoto {
  title: string
  thumbnailUrl: string
  width: number
  height: number
  sortOrder: number
}

/**
 * 照片列表响应
 */
export interface PhotoListResponse {
  items: PublicPhoto[]
  page: number
  pageSize: number
  total: number
}

/**
 * API 错误响应
 */
export interface ApiError {
  code: string
  message: string
  requestId?: string
}
