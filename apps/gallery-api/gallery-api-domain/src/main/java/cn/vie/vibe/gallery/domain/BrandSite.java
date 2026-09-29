package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

/**
 * 品牌站站点主表（设计文档 §7.3）：每租户一站，草稿/发布双版本。
 * 模板层不感知计费，只感知 status（TRIAL/ACTIVE/EXPIRED，§9）。
 */
public record BrandSite(
        UUID id,
        UUID tenantId,
        String subdomain,
        String status,
        boolean enabled,
        String configJson,
        int schemaVersion,
        Instant createdAt,
        Instant updatedAt,
        UUID updatedByUserId,
        Instant lastPublishedAt,
        UUID publishedVersionId
) {
    public static final int CURRENT_SCHEMA_VERSION = 1;
    public static final String STATUS_TRIAL = "TRIAL";
    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_EXPIRED = "EXPIRED";

    public static BrandSite create(UUID tenantId, String configJson) {
        Instant now = Instant.now();
        return new BrandSite(
                UUID.randomUUID(), tenantId, null, STATUS_TRIAL, true,
                configJson, CURRENT_SCHEMA_VERSION, now, now, null, null, null);
    }

    public BrandSite withConfig(String configJson, UUID updatedByUserId) {
        return new BrandSite(
                this.id, this.tenantId, this.subdomain, this.status, this.enabled,
                configJson, this.schemaVersion, this.createdAt, Instant.now(),
                updatedByUserId, this.lastPublishedAt, this.publishedVersionId);
    }

    public BrandSite withSubdomain(String subdomain) {
        return new BrandSite(
                this.id, this.tenantId, subdomain, this.status, this.enabled,
                this.configJson, this.schemaVersion, this.createdAt, Instant.now(),
                this.updatedByUserId, this.lastPublishedAt, this.publishedVersionId);
    }

    public BrandSite withStatus(String status) {
        return new BrandSite(
                this.id, this.tenantId, this.subdomain, status, this.enabled,
                this.configJson, this.schemaVersion, this.createdAt, Instant.now(),
                this.updatedByUserId, this.lastPublishedAt, this.publishedVersionId);
    }

    public BrandSite withEnabled(boolean enabled) {
        return new BrandSite(
                this.id, this.tenantId, this.subdomain, this.status, enabled,
                this.configJson, this.schemaVersion, this.createdAt, Instant.now(),
                this.updatedByUserId, this.lastPublishedAt, this.publishedVersionId);
    }

    public BrandSite withPublishedVersion(UUID versionId, Instant publishedAt) {
        return new BrandSite(
                this.id, this.tenantId, this.subdomain, this.status, this.enabled,
                this.configJson, this.schemaVersion, this.createdAt, Instant.now(),
                this.updatedByUserId, publishedAt, versionId);
    }

    /** 草稿相对已发布版本是否有变更（对齐 Gallery.hasUnpublishedConfig 语义）。 */
    public boolean hasUnpublishedChanges() {
        return lastPublishedAt == null || updatedAt.isAfter(lastPublishedAt);
    }
}
