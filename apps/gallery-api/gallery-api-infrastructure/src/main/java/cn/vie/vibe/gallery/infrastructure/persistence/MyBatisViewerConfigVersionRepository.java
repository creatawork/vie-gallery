package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.ViewerConfigVersionRepository;
import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.ViewerConfigVersion;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.ViewerConfigVersionMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

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
                version.versionNumber(),
                version.configJson(),
                version.presetName(),
                version.schemaVersion(),
                MyBatisValueMapper.localDateTime(version.createdAt()),
                version.createdByUserId() == null ? null : version.createdByUserId().toString(),
                version.title(),
                version.note()
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

    @Override
    public void lockGallery(UUID tenantId, UUID galleryId) {
        if (mapper.lockGallery(tenantId.toString(), galleryId.toString()) == null) {
            throw new DomainException("GALLERY_NOT_FOUND", "Gallery not found");
        }
    }

    @Override
    @Transactional
    public <T> T withGalleryLock(UUID tenantId, UUID galleryId, Supplier<T> action) {
        lockGallery(tenantId, galleryId);
        return action.get();
    }

    @Override
    public long allocateVersionNumber(UUID tenantId, UUID galleryId) {
        Long current = mapper.versionCounter(tenantId.toString(), galleryId.toString());
        if (current == null) throw new DomainException("GALLERY_NOT_FOUND", "Gallery not found");
        long next;
        try {
            next = Math.addExact(current, 1L);
        } catch (ArithmeticException exception) {
            throw new DomainException("CONFIG_VERSION_PUBLISH_FAILED", "Configuration version number space is exhausted");
        }
        if (mapper.updateVersionCounter(tenantId.toString(), galleryId.toString(), next) != 1) {
            throw new DomainException("GALLERY_NOT_FOUND", "Gallery not found");
        }
        return next;
    }

    @Override
    public Optional<ViewerConfigVersion> findByIdIncludingDeleted(UUID tenantId, UUID galleryId, UUID versionId) {
        Map<String, Object> row = mapper.findByIdIncludingDeleted(tenantId.toString(), galleryId.toString(), versionId.toString());
        return row == null ? Optional.empty() : Optional.of(toDomain(row));
    }

    @Override
    public int updateMetadata(UUID tenantId, UUID galleryId, UUID versionId,
                              String title, String note, Instant at, UUID actor) {
        return mapper.updateMetadata(tenantId.toString(), galleryId.toString(), versionId.toString(), title, note,
                MyBatisValueMapper.localDateTime(at), actor == null ? null : actor.toString());
    }

    @Override
    public int softDelete(UUID tenantId, UUID galleryId, UUID versionId, Instant at, UUID actor) {
        return mapper.softDelete(tenantId.toString(), galleryId.toString(), versionId.toString(),
                MyBatisValueMapper.localDateTime(at), actor == null ? null : actor.toString());
    }

    private ViewerConfigVersion toDomain(Map<String, Object> row) {
        return new ViewerConfigVersion(
                MyBatisValueMapper.uuid(row, "id"),
                MyBatisValueMapper.uuid(row, "tenantId"),
                MyBatisValueMapper.uuid(row, "galleryId"),
                ((Number) row.get("versionNumber")).longValue(),
                (String) row.get("configJson"),
                (String) row.get("presetName"),
                (int) row.get("schemaVersion"),
                MyBatisValueMapper.instant(row, "createdAt"),
                MyBatisValueMapper.uuid(row, "createdByUserId"),
                (String) row.get("title"),
                (String) row.get("note"),
                MyBatisValueMapper.instant(row, "metadataUpdatedAt"),
                MyBatisValueMapper.uuid(row, "metadataUpdatedByUserId"),
                MyBatisValueMapper.instant(row, "deletedAt"),
                MyBatisValueMapper.uuid(row, "deletedByUserId")
        );
    }
}
