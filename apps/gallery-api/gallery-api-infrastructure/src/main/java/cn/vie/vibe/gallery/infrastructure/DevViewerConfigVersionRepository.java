package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.ViewerConfigVersionRepository;
import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.ViewerConfigVersion;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

@Profile("dev-memory")
@Component
class DevViewerConfigVersionRepository implements ViewerConfigVersionRepository {
    private final ConcurrentMap<UUID, ViewerConfigVersion> versions = new ConcurrentHashMap<>();
    private final ConcurrentMap<GalleryKey, UUID> publishedByGallery = new ConcurrentHashMap<>();
    private final ConcurrentMap<GalleryKey, Long> counters = new ConcurrentHashMap<>();
    private final ConcurrentMap<GalleryKey, ReentrantLock> galleryLocks = new ConcurrentHashMap<>();

    @Override
    public void save(ViewerConfigVersion version) {
        GalleryKey key = new GalleryKey(version.tenantId(), version.galleryId());
        withLock(key, () -> {
            versions.put(version.id(), version);
            counters.merge(key, version.versionNumber(), Math::max);
            return null;
        });
    }

    @Override
    public List<ViewerConfigVersion> findByGallery(UUID tenantId, UUID galleryId, int offset, int limit) {
        return versions.values().stream()
                .filter(v -> v.tenantId().equals(tenantId) && v.galleryId().equals(galleryId) && v.deletedAt() == null)
                .sorted(Comparator.comparingLong(ViewerConfigVersion::versionNumber).reversed())
                .skip(offset)
                .limit(limit)
                .toList();
    }

    @Override
    public long countByGallery(UUID tenantId, UUID galleryId) {
        return versions.values().stream()
                .filter(v -> v.tenantId().equals(tenantId) && v.galleryId().equals(galleryId) && v.deletedAt() == null)
                .count();
    }

    @Override
    public Optional<ViewerConfigVersion> findById(UUID tenantId, UUID galleryId, UUID versionId) {
        return findByIdIncludingDeleted(tenantId, galleryId, versionId).filter(v -> v.deletedAt() == null);
    }

    @Override
    public Optional<ViewerConfigVersion> findByIdIncludingDeleted(UUID tenantId, UUID galleryId, UUID versionId) {
        return Optional.ofNullable(versions.get(versionId))
                .filter(v -> v.tenantId().equals(tenantId) && v.galleryId().equals(galleryId));
    }

    @Override
    public Optional<ViewerConfigVersion> findPublishedByGallery(UUID tenantId, UUID galleryId) {
        UUID versionId = publishedByGallery.get(new GalleryKey(tenantId, galleryId));
        return versionId == null ? Optional.empty() : findById(tenantId, galleryId, versionId);
    }

    @Override
    public int publish(UUID tenantId, UUID galleryId, UUID versionId, Instant publishedAt) {
        ViewerConfigVersion version = versions.get(versionId);
        if (version == null || version.deletedAt() != null || !version.tenantId().equals(tenantId)
                || !version.galleryId().equals(galleryId)) return 0;
        publishedByGallery.put(new GalleryKey(tenantId, galleryId), versionId);
        return 1;
    }

    @Override
    public int clearPublished(UUID tenantId, UUID galleryId) {
        return publishedByGallery.remove(new GalleryKey(tenantId, galleryId)) == null ? 0 : 1;
    }

    @Override
    public void lockGallery(UUID tenantId, UUID galleryId) {
        // withGalleryLock owns the in-memory lock for the full operation.
    }

    @Override
    public <T> T withGalleryLock(UUID tenantId, UUID galleryId, Supplier<T> action) {
        GalleryKey key = new GalleryKey(tenantId, galleryId);
        return withLock(key, () -> {
            var versionSnapshot = versions.entrySet().stream()
                    .filter(entry -> entry.getValue().tenantId().equals(tenantId)
                            && entry.getValue().galleryId().equals(galleryId))
                    .collect(java.util.stream.Collectors.toMap(java.util.Map.Entry::getKey, java.util.Map.Entry::getValue));
            Long counterSnapshot = counters.get(key);
            UUID publishedSnapshot = publishedByGallery.get(key);
            try {
                return action.get();
            } catch (RuntimeException | Error failure) {
                versions.entrySet().removeIf(entry -> entry.getValue().tenantId().equals(tenantId)
                        && entry.getValue().galleryId().equals(galleryId));
                versions.putAll(versionSnapshot);
                if (counterSnapshot == null) counters.remove(key); else counters.put(key, counterSnapshot);
                if (publishedSnapshot == null) publishedByGallery.remove(key); else publishedByGallery.put(key, publishedSnapshot);
                throw failure;
            }
        });
    }

    @Override
    public long allocateVersionNumber(UUID tenantId, UUID galleryId) {
        GalleryKey key = new GalleryKey(tenantId, galleryId);
        try {
            return withLock(key, () -> counters.compute(key,
                    (ignored, current) -> Math.addExact(current == null ? 0L : current, 1L)));
        } catch (ArithmeticException exception) {
            throw new DomainException("CONFIG_VERSION_PUBLISH_FAILED", "Configuration version number space is exhausted");
        }
    }

    @Override
    public int updateMetadata(UUID tenantId, UUID galleryId, UUID versionId,
                              String title, String note, Instant at, UUID actor) {
        GalleryKey key = new GalleryKey(tenantId, galleryId);
        return withLock(key, () -> {
            ViewerConfigVersion current = findById(tenantId, galleryId, versionId).orElse(null);
            if (current == null) return 0;
            versions.put(versionId, current.withMetadata(title, note, at, actor));
            return 1;
        });
    }

    @Override
    public int softDelete(UUID tenantId, UUID galleryId, UUID versionId, Instant at, UUID actor) {
        GalleryKey key = new GalleryKey(tenantId, galleryId);
        return withLock(key, () -> {
            ViewerConfigVersion current = findById(tenantId, galleryId, versionId).orElse(null);
            if (current == null) return 0;
            versions.put(versionId, current.deleted(at, actor));
            return 1;
        });
    }

    private <T> T withLock(GalleryKey key, Supplier<T> action) {
        ReentrantLock lock = galleryLocks.computeIfAbsent(key, ignored -> new ReentrantLock());
        lock.lock();
        try {
            return action.get();
        } finally {
            lock.unlock();
        }
    }

    private record GalleryKey(UUID tenantId, UUID galleryId) { }
}
