package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record Membership(UUID id, UUID userId, UUID tenantId, MembershipRole role, Instant createdAt) {
    public Membership(UUID id, UUID userId, UUID tenantId, MembershipRole role) {
        this(id, userId, tenantId, role, null);
    }
}
