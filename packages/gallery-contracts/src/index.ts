export type GalleryVisibility = 'PUBLIC' | 'PRIVATE' | 'PASSWORD'

export interface Gallery {
  id: string
  slug: string
  name: string
  visibility: GalleryVisibility
  createdAt: string
}

export interface ApiError {
  code: string
  message: string
  requestId: string
  details: Record<string, unknown>
}
