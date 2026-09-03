package cn.vie.vibe.gallery.domain;

import java.util.UUID;

public record TenantQuota(UUID tenantId, long maxBytes, long usedBytes, long maxPhotos, long photoCount) {}
