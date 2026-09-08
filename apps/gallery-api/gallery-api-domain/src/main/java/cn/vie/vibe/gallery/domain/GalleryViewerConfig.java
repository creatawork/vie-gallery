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
        Instant updatedAt,
        int schemaVersion,
        UUID updatedByUserId,
        Instant lastPublishedAt,
        UUID publishedVersionId
) {
    public static final int CURRENT_SCHEMA_VERSION = 1;

    public GalleryViewerConfig(
            UUID id,
            UUID galleryId,
            String configJson,
            boolean enabled,
            String presetName,
            Instant createdAt,
            Instant updatedAt
    ) {
        this(id, galleryId, configJson, enabled, presetName, createdAt, updatedAt,
                CURRENT_SCHEMA_VERSION, null, null, null);
    }

    public static GalleryViewerConfig create(UUID galleryId, String configJson, String presetName) {
        Instant now = Instant.now();
        return new GalleryViewerConfig(
                UUID.randomUUID(),
                galleryId,
                configJson,
                true,
                presetName,
                now,
                now,
                CURRENT_SCHEMA_VERSION,
                null,
                null,
                null
        );
    }

    public GalleryViewerConfig withUpdate(String configJson, String presetName, UUID updatedByUserId) {
        return new GalleryViewerConfig(
                this.id,
                this.galleryId,
                configJson,
                this.enabled,
                presetName,
                this.createdAt,
                Instant.now(),
                this.schemaVersion,
                updatedByUserId,
                this.lastPublishedAt,
                this.publishedVersionId
        );
    }

    public GalleryViewerConfig withUpdate(String configJson, String presetName) {
        return withUpdate(configJson, presetName, this.updatedByUserId);
    }

    public GalleryViewerConfig withEnabled(boolean enabled) {
        return new GalleryViewerConfig(
                this.id,
                this.galleryId,
                this.configJson,
                enabled,
                this.presetName,
                this.createdAt,
                Instant.now(),
                this.schemaVersion,
                this.updatedByUserId,
                this.lastPublishedAt,
                this.publishedVersionId
        );
    }

    public GalleryViewerConfig withPublishedVersion(UUID versionId, Instant publishedAt) {
        return new GalleryViewerConfig(
                this.id,
                this.galleryId,
                this.configJson,
                this.enabled,
                this.presetName,
                this.createdAt,
                Instant.now(),
                this.schemaVersion,
                this.updatedByUserId,
                publishedAt,
                versionId
        );
    }

    public GalleryViewerConfig withDraft(String configJson, String presetName, UUID updatedByUserId) {
        return withUpdate(configJson, presetName, updatedByUserId);
    }

    public GalleryViewerConfig withPublishedSnapshot(ViewerConfigVersion version) {
        return new GalleryViewerConfig(
                this.id,
                this.galleryId,
                version.configJson(),
                this.enabled,
                version.presetName(),
                this.createdAt,
                this.updatedAt,
                version.schemaVersion(),
                this.updatedByUserId,
                this.lastPublishedAt,
                version.id()
        );
    }
}
