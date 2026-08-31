package cn.vie.vibe.gallery.domain;

import java.util.UUID;

public record Photo(UUID id, UUID tenantId, UUID galleryId, UUID storageObjectId,
                    String title, int sortOrder, boolean cover, boolean deleted) {
}
