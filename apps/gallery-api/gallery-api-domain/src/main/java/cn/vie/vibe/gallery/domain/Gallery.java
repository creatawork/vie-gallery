package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record Gallery(UUID id, UUID tenantId, String slug, String name,
                      GalleryVisibility visibility, boolean deleted, Instant createdAt) {
}
