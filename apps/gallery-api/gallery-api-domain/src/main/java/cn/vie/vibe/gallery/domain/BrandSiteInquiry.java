package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

/** 品牌站站内表单询盘（§4.2 contact 必备区块的存储侧）。 */
public record BrandSiteInquiry(UUID id, UUID siteId, String name, String message, Instant createdAt) {}
