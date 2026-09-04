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
        Instant createdAt
) {
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
