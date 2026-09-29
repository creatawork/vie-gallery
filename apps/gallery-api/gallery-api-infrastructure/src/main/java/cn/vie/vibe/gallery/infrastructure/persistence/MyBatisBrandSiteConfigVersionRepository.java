package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.BrandSiteConfigVersionRepository;
import cn.vie.vibe.gallery.domain.BrandSite;
import cn.vie.vibe.gallery.domain.BrandSiteConfigVersion;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.BrandSiteConfigVersionMapper;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Repository
@Profile("!dev-memory")
public class MyBatisBrandSiteConfigVersionRepository implements BrandSiteConfigVersionRepository {
    private final BrandSiteConfigVersionMapper mapper;

    public MyBatisBrandSiteConfigVersionRepository(BrandSiteConfigVersionMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public void save(BrandSiteConfigVersion version) {
        mapper.insert(
                version.id().toString(),
                version.tenantId().toString(),
                version.siteId().toString(),
                version.configJson(),
                version.templateId(),
                version.schemaVersion(),
                MyBatisValueMapper.localDateTime(version.createdAt()),
                version.createdByUserId() == null ? null : version.createdByUserId().toString()
        );
    }

    @Override
    public Optional<BrandSiteConfigVersion> findById(UUID tenantId, UUID siteId, UUID versionId) {
        return Optional.ofNullable(mapper.findById(tenantId.toString(), siteId.toString(), versionId.toString()))
                .map(this::toDomain);
    }

    @Override
    public List<BrandSiteConfigVersion> findBySite(UUID tenantId, UUID siteId, int offset, int limit) {
        return mapper.findBySite(tenantId.toString(), siteId.toString(), offset, limit).stream()
                .map(this::toDomain)
                .collect(Collectors.toList());
    }

    @Override
    public long countBySite(UUID tenantId, UUID siteId) {
        return mapper.countBySite(tenantId.toString(), siteId.toString());
    }

    @Override
    public int publish(UUID tenantId, UUID siteId, UUID versionId, java.time.Instant publishedAt) {
        return mapper.publish(
                tenantId.toString(), siteId.toString(), versionId.toString(),
                MyBatisValueMapper.localDateTime(publishedAt));
    }

    private BrandSiteConfigVersion toDomain(Map<String, Object> row) {
        Number schemaVersion = (Number) row.get("schemaVersion");
        return new BrandSiteConfigVersion(
                MyBatisValueMapper.uuid(row, "id"),
                MyBatisValueMapper.uuid(row, "tenantId"),
                MyBatisValueMapper.uuid(row, "siteId"),
                (String) row.get("configJson"),
                (String) row.get("templateId"),
                schemaVersion == null ? BrandSite.CURRENT_SCHEMA_VERSION : schemaVersion.intValue(),
                MyBatisValueMapper.instant(row, "createdAt"),
                MyBatisValueMapper.uuid(row, "createdByUserId")
        );
    }
}
