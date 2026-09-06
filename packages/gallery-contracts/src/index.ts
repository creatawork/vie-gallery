export type GalleryVisibility = 'PUBLIC' | 'PRIVATE' | 'PASSWORD'

export interface Gallery {
  id: string
  slug: string
  name: string
  visibility: GalleryVisibility
  coverPhotoId?: string
  coverThumbnailUrl?: string
  createdAt: string
}

export type PublicAccessState = 'READY' | 'PASSWORD_REQUIRED' | 'SHARE_LINK_REQUIRED' | 'EMPTY'

export interface PublicGalleryCover {
  url: string
  width: number
  height: number
}

export interface PublicGalleryResponse {
  slug: string
  title: string
  visibility: GalleryVisibility
  accessState: PublicAccessState
  cover: PublicGalleryCover | null
  photoCount: number
}

export interface UnlockResponse {
  unlocked: boolean
  expiresAt: string
}

export interface PublicPhoto {
  title: string | null
  thumbnailUrl: string | null
  width: number
  height: number
  sortOrder: number
}

export interface PublicPhotoPage {
  items: PublicPhoto[]
  page: number
  pageSize: number
  total: number
}

export type PhotoListResponse = PublicPhotoPage

export interface ApiError {
  code: string
  message: string
  requestId?: string
  details?: Record<string, unknown>
}
