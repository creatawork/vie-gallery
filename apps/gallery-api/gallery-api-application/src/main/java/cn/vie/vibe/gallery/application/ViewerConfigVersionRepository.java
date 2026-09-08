package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.ViewerConfigVersion;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ViewerConfigVersionRepository {
    void save(ViewerConfigVersion version);

    List<ViewerConfigVersion> findByGallery(UUID tenantId, UUID galleryId, int offset, int limit);

    long countByGallery(UUID tenantId, UUID galleryId);

    Optional<ViewerConfigVersion> findById(UUID tenantId, UUID galleryId, UUID versionId);

    Optional<ViewerConfigVersion> findPublishedByGallery(UUID tenantId, UUID galleryId);

    int publish(UUID tenantId, UUID galleryId, UUID versionId, Instant publishedAt);

    int clearPublished(UUID tenantId, UUID galleryId);
}
