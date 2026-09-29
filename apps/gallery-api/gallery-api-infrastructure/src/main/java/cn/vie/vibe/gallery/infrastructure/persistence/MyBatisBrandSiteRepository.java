package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.BrandSiteRepository;
import cn.vie.vibe.gallery.domain.BrandSite;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.BrandSiteMapper;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
@Profile("!dev-memory")
public class MyBatisBrandSiteRepository implements BrandSiteRepository {
    private final BrandSiteMapper mapper;

    public MyBatisBrandSiteRepository(BrandSiteMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public Optional<BrandSite> findByTenantId(UUID tenantId) {
        return Optional.ofNullable(mapper.findByTenantId(tenantId.toString())).map(this::toDomain);
    }

    @Override
    public Optional<BrandSite> findBySubdomain(String subdomain) {
        return Optional.ofNullable(mapper.findBySubdomain(subdomain)).map(this::toDomain);
    }

    @Override
    public void save(BrandSite site) {
        mapper.upsert(
                site.id().toString(),
                site.tenantId().toString(),
                site.subdomain(),
                site.status(),
                site.enabled(),
                site.configJson(),
                site.schemaVersion(),
                MyBatisValueMapper.localDateTime(site.createdAt()),
                MyBatisValueMapper.localDateTime(site.updatedAt()),
                site.updatedByUserId() == null ? null : site.updatedByUserId().toString(),
                MyBatisValueMapper.localDateTime(site.lastPublishedAt()),
                site.publishedVersionId() == null ? null : site.publishedVersionId().toString()
        );
    }

    private BrandSite toDomain(Map<String, Object> row) {
        Boolean enabled = (Boolean) row.get("enabled");
        Number schemaVersion = (Number) row.get("schemaVersion");
        return new BrandSite(
                MyBatisValueMapper.uuid(row, "id"),
                MyBatisValueMapper.uuid(row, "tenantId"),
                (String) row.get("subdomain"),
                (String) row.get("status"),
                enabled != null && enabled,
                (String) row.get("configJson"),
                schemaVersion == null ? BrandSite.CURRENT_SCHEMA_VERSION : schemaVersion.intValue(),
                MyBatisValueMapper.instant(row, "createdAt"),
                MyBatisValueMapper.instant(row, "updatedAt"),
                MyBatisValueMapper.uuid(row, "updatedByUserId"),
                MyBatisValueMapper.instant(row, "lastPublishedAt"),
                MyBatisValueMapper.uuid(row, "publishedVersionId")
        );
    }
}
