package cn.vie.vibe.gallery.application;

import java.time.Instant;

/**
 * 创建分享链接命令
 */
public record CreateShareLinkCommand(
        String galleryId,
        Instant expiresAt
) {
    public CreateShareLinkCommand {
        if (galleryId == null || galleryId.isBlank()) {
            throw new IllegalArgumentException("Gallery ID cannot be null or blank");
        }
        if (expiresAt != null && expiresAt.isBefore(Instant.now())) {
            throw new IllegalArgumentException("Expiration time cannot be in the past");
        }
    }
}
