package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

/** 品牌站配置版本快照（不可变，对齐 gallery_viewer_config_version 结构，§7.3）。 */
public record BrandSiteConfigVersion(
        UUID id,
        UUID tenantId,
        UUID siteId,
        String configJson,
        String templateId,
        int schemaVersion,
        Instant createdAt,
        UUID createdByUserId
) {
    public static BrandSiteConfigVersion create(
            UUID tenantId, UUID siteId, String configJson, String templateId, int schemaVersion, UUID createdByUserId
    ) {
        return new BrandSiteConfigVersion(
                UUID.randomUUID(), tenantId, siteId, configJson, templateId,
                schemaVersion, Instant.now(), createdByUserId);
    }
}
