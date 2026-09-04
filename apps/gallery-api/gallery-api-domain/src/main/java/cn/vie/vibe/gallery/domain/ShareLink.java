package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

/**
 * 分享链接领域对象
 */
public class ShareLink {
    private final UUID id;
    private final UUID galleryId;
    private final String tokenHash;
    private final Instant expiresAt;
    private final Instant revokedAt;
    private final Instant lastAccessedAt;
    private final Instant createdAt;
    private final Instant updatedAt;

    public ShareLink(
            UUID id,
            UUID galleryId,
            String tokenHash,
            Instant expiresAt,
            Instant revokedAt,
            Instant lastAccessedAt,
            Instant createdAt,
            Instant updatedAt
    ) {
        if (id == null) {
            throw new DomainException("SHARE_LINK_INVALID", "Share link id cannot be null");
        }
        if (galleryId == null) {
            throw new DomainException("SHARE_LINK_INVALID", "Gallery id cannot be null");
        }
        if (tokenHash == null || tokenHash.isBlank()) {
            throw new DomainException("SHARE_LINK_INVALID", "Token hash cannot be null or blank");
        }

        this.id = id;
        this.galleryId = galleryId;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
        this.revokedAt = revokedAt;
        this.lastAccessedAt = lastAccessedAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getGalleryId() {
        return galleryId;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public Instant getLastAccessedAt() {
        return lastAccessedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /**
     * 检查链接是否已撤销
     */
    public boolean isRevoked() {
        return revokedAt != null;
    }

    /**
     * 检查链接是否已过期
     */
    public boolean isExpired(Instant now) {
        return expiresAt != null && now.isAfter(expiresAt);
    }

    /**
     * 检查链接是否有效（未撤销且未过期）
     */
    public boolean isValid(Instant now) {
        return !isRevoked() && !isExpired(now);
    }

    /**
     * 计算当前状态
     */
    public ShareLinkStatus getStatus(Instant now) {
        if (isRevoked()) {
            return ShareLinkStatus.REVOKED;
        }
        if (isExpired(now)) {
            return ShareLinkStatus.EXPIRED;
        }
        return ShareLinkStatus.ACTIVE;
    }
}
