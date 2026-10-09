package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.ViewerConfigVersion;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

public interface ViewerConfigVersionRepository {
    void save(ViewerConfigVersion version);

    List<ViewerConfigVersion> findByGallery(UUID tenantId, UUID galleryId, int offset, int limit);

    long countByGallery(UUID tenantId, UUID galleryId);

    Optional<ViewerConfigVersion> findById(UUID tenantId, UUID galleryId, UUID versionId);

    Optional<ViewerConfigVersion> findPublishedByGallery(UUID tenantId, UUID galleryId);

    int publish(UUID tenantId, UUID galleryId, UUID versionId, Instant publishedAt);

    int clearPublished(UUID tenantId, UUID galleryId);

    void lockGallery(UUID tenantId, UUID galleryId);

    <T> T withGalleryLock(UUID tenantId, UUID galleryId, Supplier<T> action);

    long allocateVersionNumber(UUID tenantId, UUID galleryId);

    Optional<ViewerConfigVersion> findByIdIncludingDeleted(UUID tenantId, UUID galleryId, UUID versionId);

    int updateMetadata(UUID tenantId, UUID galleryId, UUID versionId,
                       String title, String note, Instant at, UUID actor);

    int softDelete(UUID tenantId, UUID galleryId, UUID versionId, Instant at, UUID actor);
}
