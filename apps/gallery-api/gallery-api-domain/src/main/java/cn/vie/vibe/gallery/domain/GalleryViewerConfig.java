package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record GalleryViewerConfig(
        UUID id,
        UUID galleryId,
        String configJson,
        boolean enabled,
        String presetName,
        Instant createdAt,
        Instant updatedAt
) {
    public static GalleryViewerConfig create(UUID galleryId, String configJson, String presetName) {
        Instant now = Instant.now();
        return new GalleryViewerConfig(
                UUID.randomUUID(),
                galleryId,
                configJson,
                true,
                presetName,
                now,
                now
        );
    }

    public GalleryViewerConfig withUpdate(String configJson, String presetName) {
        return new GalleryViewerConfig(
                this.id,
                this.galleryId,
                configJson,
                this.enabled,
                presetName,
                this.createdAt,
                Instant.now()
        );
    }

    public GalleryViewerConfig withEnabled(boolean enabled) {
        return new GalleryViewerConfig(
                this.id,
                this.galleryId,
                this.configJson,
                enabled,
                this.presetName,
                this.createdAt,
                Instant.now()
        );
    }
}
