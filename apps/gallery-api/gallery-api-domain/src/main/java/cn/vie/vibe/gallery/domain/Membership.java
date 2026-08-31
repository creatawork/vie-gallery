package cn.vie.vibe.gallery.domain;

import java.util.UUID;

public record Membership(UUID id, UUID userId, UUID tenantId, MembershipRole role) {
}
