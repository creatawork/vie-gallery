package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.BrandSiteConfigVersionRepository;
import cn.vie.vibe.gallery.application.BrandSiteInquiryRepository;
import cn.vie.vibe.gallery.application.BrandSiteRepository;
import cn.vie.vibe.gallery.domain.BrandSite;
import cn.vie.vibe.gallery.domain.BrandSiteConfigVersion;
import cn.vie.vibe.gallery.domain.BrandSiteInquiry;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/** dev-memory profile 下的品牌站内存仓储（无 MySQL 快速联调用）。 */
@Profile("dev-memory")
@Component
class DevBrandSiteRepository implements BrandSiteRepository {
    final Map<UUID, BrandSite> sites = new ConcurrentHashMap<>();
    final Map<String, UUID> subdomainIndex = new ConcurrentHashMap<>();

    @Override
    public Optional<BrandSite> findByTenantId(UUID tenantId) {
        return sites.values().stream().filter(s -> s.tenantId().equals(tenantId)).findFirst();
    }

    @Override
    public Optional<BrandSite> findBySubdomain(String subdomain) {
        return Optional.ofNullable(subdomainIndex.get(subdomain)).map(sites::get);
    }

    @Override
    public synchronized void save(BrandSite site) {
        BrandSite existing = sites.get(site.id());
        if (existing != null && existing.subdomain() != null && !existing.subdomain().equals(site.subdomain())) {
            subdomainIndex.remove(existing.subdomain());
        }
        sites.put(site.id(), site);
        if (site.subdomain() != null) {
            subdomainIndex.put(site.subdomain(), site.id());
        }
    }
}

@Profile("dev-memory")
@Component
class DevBrandSiteConfigVersionRepository implements BrandSiteConfigVersionRepository {
    private final Map<UUID, List<BrandSiteConfigVersion>> bySite = new ConcurrentHashMap<>();

    @Override
    public synchronized void save(BrandSiteConfigVersion version) {
        bySite.computeIfAbsent(version.siteId(), k -> Collections.synchronizedList(new ArrayList<>())).add(version);
    }

    @Override
    public Optional<BrandSiteConfigVersion> findById(UUID tenantId, UUID siteId, UUID versionId) {
        return bySite.getOrDefault(siteId, new ArrayList<>()).stream()
                .filter(v -> v.tenantId().equals(tenantId) && v.id().equals(versionId))
                .findFirst();
    }

    @Override
    public List<BrandSiteConfigVersion> findBySite(UUID tenantId, UUID siteId, int offset, int limit) {
        return bySite.getOrDefault(siteId, new ArrayList<>()).stream()
                .filter(v -> v.tenantId().equals(tenantId))
                .sorted(Comparator.comparing(BrandSiteConfigVersion::createdAt).reversed())
                .skip(offset).limit(limit).collect(Collectors.toList());
    }

    @Override
    public long countBySite(UUID tenantId, UUID siteId) {
        return bySite.getOrDefault(siteId, new ArrayList<>()).stream()
                .filter(v -> v.tenantId().equals(tenantId)).count();
    }

    @Override
    public int publish(UUID tenantId, UUID siteId, UUID versionId, Instant publishedAt) {
        return findById(tenantId, siteId, versionId).isPresent() ? 1 : 0;
    }
}

@Profile("dev-memory")
@Component
class DevBrandSiteInquiryRepository implements BrandSiteInquiryRepository {
    private final Map<UUID, List<BrandSiteInquiry>> bySite = new ConcurrentHashMap<>();

    @Override
    public synchronized void save(BrandSiteInquiry inquiry) {
        bySite.computeIfAbsent(inquiry.siteId(), k -> new ArrayList<>()).add(inquiry);
    }

    @Override
    public long countBySite(UUID siteId) {
        return bySite.getOrDefault(siteId, new ArrayList<>()).size();
    }
}
