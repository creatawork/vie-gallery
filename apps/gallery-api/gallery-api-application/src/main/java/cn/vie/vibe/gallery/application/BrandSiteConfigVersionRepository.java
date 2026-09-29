package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.BrandSiteConfigVersion;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BrandSiteConfigVersionRepository {
    void save(BrandSiteConfigVersion version);

    Optional<BrandSiteConfigVersion> findById(UUID tenantId, UUID siteId, UUID versionId);

    List<BrandSiteConfigVersion> findBySite(UUID tenantId, UUID siteId, int offset, int limit);

    long countBySite(UUID tenantId, UUID siteId);

    /** 将站点发布指针指向版本快照，返回受影响行数。 */
    int publish(UUID tenantId, UUID siteId, UUID versionId, Instant publishedAt);
}
