package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

/** Immutable published snapshot of a gallery viewer configuration. */
public record ViewerConfigVersion(
        UUID id,
        UUID tenantId,
        UUID galleryId,
        long versionNumber,
        String configJson,
        String presetName,
        int schemaVersion,
        Instant createdAt,
        UUID createdByUserId,
        String title,
        String note,
        Instant metadataUpdatedAt,
        UUID metadataUpdatedByUserId,
        Instant deletedAt,
        UUID deletedByUserId
) {
    public static ViewerConfigVersion create(
            UUID tenantId,
            UUID galleryId,
            long versionNumber,
            String configJson,
            String presetName,
            int schemaVersion,
            String title,
            String note,
            UUID createdByUserId
    ) {
        if (versionNumber < 1) throw new IllegalArgumentException("versionNumber must be positive");
        return new ViewerConfigVersion(
                UUID.randomUUID(),
                tenantId,
                galleryId,
                versionNumber,
                configJson,
                presetName,
                schemaVersion,
                Instant.now(),
                createdByUserId,
                title,
                note,
                null,
                null,
                null,
                null
        );
    }

    public ViewerConfigVersion withMetadata(String title, String note, Instant updatedAt, UUID updatedByUserId) {
        return new ViewerConfigVersion(id, tenantId, galleryId, versionNumber, configJson, presetName, schemaVersion,
                createdAt, createdByUserId, title, note, updatedAt, updatedByUserId, deletedAt, deletedByUserId);
    }

    public ViewerConfigVersion deleted(Instant at, UUID actorId) {
        return new ViewerConfigVersion(id, tenantId, galleryId, versionNumber, configJson, presetName, schemaVersion,
                createdAt, createdByUserId, title, note, metadataUpdatedAt, metadataUpdatedByUserId, at, actorId);
    }
}
