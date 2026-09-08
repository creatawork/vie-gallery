package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.ViewerConfigVersionRepository;
import cn.vie.vibe.gallery.domain.ViewerConfigVersion;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Profile("dev-memory")
@Component
class DevViewerConfigVersionRepository implements ViewerConfigVersionRepository {
    private final ConcurrentMap<UUID, ViewerConfigVersion> versions = new ConcurrentHashMap<>();
    private final ConcurrentMap<UUID, UUID> publishedByGallery = new ConcurrentHashMap<>();

    @Override
    public void save(ViewerConfigVersion version) {
        versions.put(version.id(), version);
    }

    @Override
    public List<ViewerConfigVersion> findByGallery(UUID tenantId, UUID galleryId, int offset, int limit) {
        return versions.values().stream()
                .filter(v -> v.tenantId().equals(tenantId) && v.galleryId().equals(galleryId))
                .sorted(Comparator.comparing(ViewerConfigVersion::createdAt).reversed()
                        .thenComparing(ViewerConfigVersion::id, Comparator.reverseOrder()))
                .skip(offset)
                .limit(limit)
                .toList();
    }

    @Override
    public long countByGallery(UUID tenantId, UUID galleryId) {
        return versions.values().stream()
                .filter(v -> v.tenantId().equals(tenantId) && v.galleryId().equals(galleryId))
                .count();
    }

    @Override
    public Optional<ViewerConfigVersion> findById(UUID tenantId, UUID galleryId, UUID versionId) {
        return Optional.ofNullable(versions.get(versionId))
                .filter(v -> v.tenantId().equals(tenantId) && v.galleryId().equals(galleryId));
    }

    @Override
    public Optional<ViewerConfigVersion> findPublishedByGallery(UUID tenantId, UUID galleryId) {
        UUID versionId = publishedByGallery.get(galleryId);
        return versionId == null ? Optional.empty() : findById(tenantId, galleryId, versionId);
    }

    @Override
    public int publish(UUID tenantId, UUID galleryId, UUID versionId, Instant publishedAt) {
        ViewerConfigVersion version = versions.get(versionId);
        if (version == null || !version.tenantId().equals(tenantId) || !version.galleryId().equals(galleryId)) {
            return 0;
        }
        publishedByGallery.put(galleryId, versionId);
        return 1;
    }

    @Override
    public int clearPublished(UUID tenantId, UUID galleryId) {
        Optional<ViewerConfigVersion> current = findPublishedByGallery(tenantId, galleryId);
        if (current.isEmpty()) return 0;
        publishedByGallery.remove(galleryId, current.get().id());
        return 1;
    }
}
