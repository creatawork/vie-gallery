package cn.vie.vibe.gallery.domain;

import java.util.UUID;

public record TenantContext(UUID userId, UUID tenantId, MembershipRole role) {
}
