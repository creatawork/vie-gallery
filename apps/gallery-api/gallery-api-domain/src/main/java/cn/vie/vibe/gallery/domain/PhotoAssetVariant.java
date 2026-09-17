package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record PhotoAssetVariant(
        UUID id,
        UUID tenantId,
        UUID photoId,
        UUID storageObjectId,
        VariantKind kind,
        String objectKey,
        String mimeType,
        long byteSize,
        int width,
        int height,
        String sha256,
        VariantStatus status,
        Instant createdAt,
        Instant updatedAt
) {
    public static PhotoAssetVariant ready(
            UUID tenantId, UUID photoId, UUID storageObjectId, VariantKind kind,
            String objectKey, String mimeType, long byteSize, int width, int height, String sha256
    ) {
        Instant now = Instant.now();
        return new PhotoAssetVariant(UUID.randomUUID(), tenantId, photoId, storageObjectId, kind,
                objectKey, mimeType, byteSize, width, height, sha256, VariantStatus.READY, now, now);
    }
}
