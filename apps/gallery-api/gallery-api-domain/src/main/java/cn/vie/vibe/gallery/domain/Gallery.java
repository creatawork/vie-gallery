package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record Gallery(
        UUID id,
        UUID tenantId,
        String slug,
        String name,
        GalleryVisibility visibility,
        String passwordHash,
        UUID coverPhotoId,
        boolean deleted,
        Instant createdAt,
        GalleryStatus status,
        Instant publishedAt,
        Instant updatedAt
) {
    public Gallery(
            UUID id,
            UUID tenantId,
            String slug,
            String name,
            GalleryVisibility visibility,
            String passwordHash,
            UUID coverPhotoId,
            boolean deleted,
            Instant createdAt,
            GalleryStatus status,
            Instant publishedAt
    ) {
        this(id, tenantId, slug, name, visibility, passwordHash, coverPhotoId, deleted, createdAt,
                status, publishedAt, createdAt);
    }

    /**
     * Compatibility constructor for pre-M4 callers. Existing persisted-style fixtures
     * represent galleries that were already publicly usable before publication status
     * was introduced.
     */
    public Gallery(UUID id, UUID tenantId, String slug, String name, GalleryVisibility visibility,
                   String passwordHash, UUID coverPhotoId, boolean deleted, Instant createdAt) {
        this(id, tenantId, slug, name, visibility, passwordHash, coverPhotoId, deleted, createdAt,
                GalleryStatus.PUBLISHED, createdAt, createdAt);
    }

    /**
     * 检查相册是否需要密码访问
     */
    public boolean requiresPassword() {
        return visibility == GalleryVisibility.PASSWORD && passwordHash != null;
    }

    /**
     * 检查相册是否公开可访问
     */
    public boolean isPublic() {
        return visibility == GalleryVisibility.PUBLIC;
    }
}
