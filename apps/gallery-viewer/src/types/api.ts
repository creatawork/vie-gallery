/**
 * Viewer consumes the public API contract directly. Keep this module as the
 * app-facing import boundary so components do not duplicate DTO definitions.
 */
export type {
  ApiError,
  GalleryVisibility,
  PublicAccessState,
  PublicGalleryResponse,
  PublicPhoto,
  PublicPhotoPage,
  UnlockResponse
} from '@vie/gallery-contracts'

export type PhotoListResponse = import('@vie/gallery-contracts').PublicPhotoPage
