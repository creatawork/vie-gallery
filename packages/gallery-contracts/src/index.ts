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

export interface ApiError {
  code: string
  message: string
  requestId: string
  details: Record<string, unknown>
}
