package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.ShareLinkStatus;

import java.time.Instant;
import java.util.UUID;

/**
 * 分享链接管理视图（脱敏）
 */
public record ShareLinkView(
        UUID id,
        UUID galleryId,
        ShareLinkStatus status,
        Instant expiresAt,
        Instant lastAccessedAt,
        Instant createdAt
) {}
