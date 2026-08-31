package cn.vie.vibe.gallery.domain;

import java.util.UUID;

public record Tenant(UUID id, String name, String slug, TenantStatus status) {
}
