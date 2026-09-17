package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.PhotoAssetVariant;
import cn.vie.vibe.gallery.domain.VariantKind;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PhotoAssetVariantRepository {
    PhotoAssetVariant upsert(PhotoAssetVariant variant);
    List<PhotoAssetVariant> findByPhoto(UUID tenantId, UUID photoId);
    Optional<PhotoAssetVariant> findReadyByPhotoAndKind(UUID tenantId, UUID photoId, VariantKind kind);
    int markFailed(UUID tenantId, UUID photoId, VariantKind kind);
    int softDelete(UUID tenantId, UUID photoId, VariantKind kind);
}
