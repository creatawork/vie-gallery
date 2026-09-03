package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record StorageObject(UUID id, UUID tenantId, String bucket, String objectKey, String thumbnailKey,
                            String mimeType, long byteSize, Integer width, Integer height, String sha256,
                            StorageObjectStatus status, Instant createdAt) {}
