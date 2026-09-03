package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record Photo(UUID id, UUID tenantId, UUID galleryId, UUID storageObjectId, String title,
                    int sortOrder, boolean cover, PhotoStatus status, Instant createdAt) {}
