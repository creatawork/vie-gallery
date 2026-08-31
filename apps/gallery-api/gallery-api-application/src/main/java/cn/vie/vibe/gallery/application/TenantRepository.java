package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.Tenant;

import java.util.Optional;
import java.util.UUID;

public interface TenantRepository {
    Tenant save(Tenant tenant);
    Optional<Tenant> findActiveById(UUID id);
}
