package cn.vie.vibe.gallery.application;

import java.time.Instant;
import java.util.UUID;

/**
 * 创建分享链接结果，只在创建时返回一次 rawToken
 */
public record CreateShareLinkResult(
        UUID id,
        UUID galleryId,
        Instant expiresAt,
        Instant createdAt,
        String status,
        String shareUrl,
        String rawToken
) {}
