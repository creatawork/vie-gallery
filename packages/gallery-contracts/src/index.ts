export type GalleryVisibility = 'PUBLIC' | 'PRIVATE' | 'PASSWORD'
export type GalleryStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type ShareLinkStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED'

export type MembershipRole = 'OWNER' | 'EDITOR' | 'VIEWER'

export type Capability =
  | 'GALLERY_READ'
  | 'GALLERY_CREATE'
  | 'PHOTO_READ'
  | 'PHOTO_WRITE'
  | 'CONFIG_READ'
  | 'CONFIG_WRITE'
  | 'PUBLISH'
  | 'SHARE_MANAGE'
  | 'MEMBER_MANAGE'

export interface WorkspaceMember {
  id: string
  userId?: string
  displayName: string
  email: string
  role: MembershipRole
  joinedAt?: string | null
}

export interface AuthCapabilities {
  role: MembershipRole
  capabilities: Capability[]
}

export interface AuthResponse {
  user: {
    id?: string
    email?: string
    displayName?: string
  }
  tenant?: {
    id?: string
    name?: string
    slug?: string
  }
  role: MembershipRole
  capabilities: Capability[]
}

export interface Gallery {
  id: string
  slug: string
  name: string
  visibility: GalleryVisibility
  status: GalleryStatus
  publishedAt?: string | null
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
  mediumUrl?: string | null
  textureUrl?: string | null
}

export interface PublicPhotoPage {
  items: PublicPhoto[]
  page: number
  pageSize: number
  total: number
}

export type PhotoListResponse = PublicPhotoPage

export interface ViewerConfigVersion {
  id: string
  galleryId: string
  configJson: string
  presetName?: string | null
  schemaVersion: number
  createdAt: string
  createdByUserId?: string | null
}

export interface ViewerConfigResponse {
  id: string
  galleryId: string
  configJson: string
  enabled: boolean
  presetName?: string | null
  createdAt: string
  updatedAt: string
  schemaVersion: number
  updatedByUserId?: string | null
  lastPublishedAt?: string | null
  publishedVersionId?: string | null
}

export interface ViewerConfigVersionPage {
  items: ViewerConfigVersion[]
  page: number
  pageSize: number
  total: number
}

export interface ApiError {
  code: string
  message: string
  /** HTTP status is transport metadata and may be absent in the JSON body. */
  status?: number
  requestId?: string
  details?: Record<string, unknown>
}
