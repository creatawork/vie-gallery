package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.ViewerConfigVersionRepository;
import cn.vie.vibe.gallery.domain.ViewerConfigVersion;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.ViewerConfigVersionMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
public class MyBatisViewerConfigVersionRepository implements ViewerConfigVersionRepository {
    private final ViewerConfigVersionMapper mapper;

    public MyBatisViewerConfigVersionRepository(ViewerConfigVersionMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public void save(ViewerConfigVersion version) {
        mapper.insert(
                version.id().toString(),
                version.tenantId().toString(),
                version.galleryId().toString(),
                version.configJson(),
                version.presetName(),
                version.schemaVersion(),
                MyBatisValueMapper.localDateTime(version.createdAt()),
                version.createdByUserId() == null ? null : version.createdByUserId().toString()
        );
    }

    @Override
    public List<ViewerConfigVersion> findByGallery(UUID tenantId, UUID galleryId, int offset, int limit) {
        List<Map<String, Object>> rows = mapper.findByGallery(tenantId.toString(), galleryId.toString(), offset, limit);
        return rows.stream().map(this::toDomain).toList();
    }

    @Override
    public long countByGallery(UUID tenantId, UUID galleryId) {
        return mapper.countByGallery(tenantId.toString(), galleryId.toString());
    }

    @Override
    public Optional<ViewerConfigVersion> findById(UUID tenantId, UUID galleryId, UUID versionId) {
        Map<String, Object> row = mapper.findById(tenantId.toString(), galleryId.toString(), versionId.toString());
        if (row == null) {
            return Optional.empty();
        }
        return Optional.of(toDomain(row));
    }

    @Override
    public Optional<ViewerConfigVersion> findPublishedByGallery(UUID tenantId, UUID galleryId) {
        Map<String, Object> row = mapper.findPublished(tenantId.toString(), galleryId.toString());
        if (row == null) {
            return Optional.empty();
        }
        return Optional.of(toDomain(row));
    }

    @Override
    public int publish(UUID tenantId, UUID galleryId, UUID versionId, Instant publishedAt) {
        return mapper.publish(
                tenantId.toString(),
                galleryId.toString(),
                versionId.toString(),
                MyBatisValueMapper.localDateTime(publishedAt)
        );
    }

    @Override
    public int clearPublished(UUID tenantId, UUID galleryId) {
        return mapper.clearPublished(tenantId.toString(), galleryId.toString());
    }

    private ViewerConfigVersion toDomain(Map<String, Object> row) {
        return new ViewerConfigVersion(
                MyBatisValueMapper.uuid(row, "id"),
                MyBatisValueMapper.uuid(row, "tenantId"),
                MyBatisValueMapper.uuid(row, "galleryId"),
                (String) row.get("configJson"),
                (String) row.get("presetName"),
                (int) row.get("schemaVersion"),
                MyBatisValueMapper.instant(row, "createdAt"),
                MyBatisValueMapper.uuid(row, "createdByUserId")
        );
    }
}
