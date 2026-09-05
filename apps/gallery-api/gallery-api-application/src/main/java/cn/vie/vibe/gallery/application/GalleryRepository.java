package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.Gallery;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GalleryRepository {
    List<Gallery> findAll(UUID tenantId);
    Optional<Gallery> findByTenantAndSlug(UUID tenantId, String slug);
    Optional<Gallery> findBySlug(String slug);
    Optional<Gallery> findById(UUID galleryId);
    Optional<Gallery> findById(UUID tenantId, UUID galleryId);
    Gallery save(Gallery gallery);
    void update(Gallery gallery);
    void updateCoverPhoto(UUID tenantId, UUID galleryId, UUID coverPhotoId);
}
