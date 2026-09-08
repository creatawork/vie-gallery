package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.PhotoAssetVariantRepository;
import cn.vie.vibe.gallery.domain.PhotoAssetVariant;
import cn.vie.vibe.gallery.domain.VariantKind;
import cn.vie.vibe.gallery.domain.VariantStatus;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Profile("dev-memory")
@Component
class DevPhotoAssetVariantRepository implements PhotoAssetVariantRepository {
    private final ConcurrentMap<String, PhotoAssetVariant> variants = new ConcurrentHashMap<>();

    @Override
    public PhotoAssetVariant upsert(PhotoAssetVariant variant) {
        variants.put(key(variant.tenantId(), variant.photoId(), variant.kind()), variant);
        return variant;
    }

    @Override
    public List<PhotoAssetVariant> findByPhoto(UUID tenantId, UUID photoId) {
        return variants.values().stream()
                .filter(v -> v.tenantId().equals(tenantId) && v.photoId().equals(photoId))
                .toList();
    }

    @Override
    public Optional<PhotoAssetVariant> findReadyByPhotoAndKind(UUID tenantId, UUID photoId, VariantKind kind) {
        return Optional.ofNullable(variants.get(key(tenantId, photoId, kind)))
                .filter(v -> v.status() == VariantStatus.READY);
    }

    @Override
    public int markFailed(UUID tenantId, UUID photoId, VariantKind kind) {
        return updateStatus(tenantId, photoId, kind, VariantStatus.FAILED);
    }

    @Override
    public int softDelete(UUID tenantId, UUID photoId, VariantKind kind) {
        return updateStatus(tenantId, photoId, kind, VariantStatus.DELETED);
    }

    private int updateStatus(UUID tenantId, UUID photoId, VariantKind kind, VariantStatus status) {
        String key = key(tenantId, photoId, kind);
        PhotoAssetVariant current = variants.get(key);
        if (current == null) return 0;
        variants.put(key, new PhotoAssetVariant(current.id(), current.tenantId(), current.photoId(), current.storageObjectId(),
                current.kind(), current.objectKey(), current.mimeType(), current.byteSize(), current.width(), current.height(),
                current.sha256(), status, current.createdAt(), Instant.now()));
        return 1;
    }

    private static String key(UUID tenantId, UUID photoId, VariantKind kind) {
        return tenantId + ":" + photoId + ":" + kind;
    }
}
