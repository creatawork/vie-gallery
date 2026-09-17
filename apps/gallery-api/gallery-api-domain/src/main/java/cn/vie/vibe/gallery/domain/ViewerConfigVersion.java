package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

/** Immutable published snapshot of a gallery viewer configuration. */
public record ViewerConfigVersion(
        UUID id,
        UUID tenantId,
        UUID galleryId,
        String configJson,
        String presetName,
        int schemaVersion,
        Instant createdAt,
        UUID createdByUserId
) {
    public static ViewerConfigVersion create(
            UUID tenantId,
            UUID galleryId,
            String configJson,
            String presetName,
            int schemaVersion,
            UUID createdByUserId
    ) {
        return new ViewerConfigVersion(
                UUID.randomUUID(),
                tenantId,
                galleryId,
                configJson,
                presetName,
                schemaVersion,
                Instant.now(),
                createdByUserId
        );
    }
}
