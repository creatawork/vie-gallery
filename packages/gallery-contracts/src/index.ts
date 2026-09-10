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
  updatedAt?: string | null
  photoCount?: number
  failedPhotoCount?: number
  processingCount?: number
  hasUnpublishedConfig?: boolean
  storageUsedBytes?: number
}

export type GallerySummary = Gallery

export interface PublishBlocker {
  code: string
  message: string
}

export interface PublishReadinessResponse {
  galleryStatus: GalleryStatus
  readyPhotoCount: number
  galleryPublishable: boolean
  configDraftChanged: boolean
  publishedConfigVersionId?: string | null
  draftConfigVersionId?: string | null
  publishedAt?: string | null
  lastConfigPublishedAt?: string | null
  blockers: PublishBlocker[]
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

export type TaskFilter = 'ALL' | 'ACTIVE' | 'FAILED' | 'COMPLETED'

export interface UploadTaskSummary {
  queued: number
  processing: number
  succeeded: number
  failed: number
  cancelRequested: number
  cancelled: number
}

export interface UploadTaskPage {
  items: UploadTask[]
  page?: number
  pageSize?: number
  total: number
  summary: UploadTaskSummary
}

