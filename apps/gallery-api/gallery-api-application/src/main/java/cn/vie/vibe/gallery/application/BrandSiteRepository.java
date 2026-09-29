package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.BrandSite;

import java.util.Optional;
import java.util.UUID;

public interface BrandSiteRepository {
    Optional<BrandSite> findByTenantId(UUID tenantId);

    Optional<BrandSite> findBySubdomain(String subdomain);

    void save(BrandSite site);
}
