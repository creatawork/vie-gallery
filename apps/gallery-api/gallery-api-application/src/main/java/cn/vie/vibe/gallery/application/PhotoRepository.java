package cn.vie.vibe.gallery.application;
import cn.vie.vibe.gallery.domain.Photo;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
public interface PhotoRepository {
    Photo save(Photo photo);
    List<Photo> findByGallery(UUID tenantId, UUID galleryId);
    Optional<Photo> findById(UUID tenantId, UUID photoId);
    Optional<Photo> findById(UUID photoId);
    int countByGalleryId(UUID galleryId);
    List<Photo> findByGalleryIdWithPagination(UUID galleryId, int offset, int limit);
    int updateStatus(UUID tenantId, UUID photoId, PhotoStatus status);
    int updateMetadata(UUID tenantId, UUID photoId, String title, Integer sortOrder, Boolean cover);
    int softDelete(UUID tenantId, UUID photoId);
}
