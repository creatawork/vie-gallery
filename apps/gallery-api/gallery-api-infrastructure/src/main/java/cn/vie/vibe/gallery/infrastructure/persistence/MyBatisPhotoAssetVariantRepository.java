package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.PhotoAssetVariantRepository;
import cn.vie.vibe.gallery.domain.PhotoAssetVariant;
import cn.vie.vibe.gallery.domain.VariantKind;
import cn.vie.vibe.gallery.domain.VariantStatus;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.PhotoAssetVariantMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
public class MyBatisPhotoAssetVariantRepository implements PhotoAssetVariantRepository {
    private final PhotoAssetVariantMapper mapper;

    public MyBatisPhotoAssetVariantRepository(PhotoAssetVariantMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public PhotoAssetVariant upsert(PhotoAssetVariant variant) {
        mapper.upsert(variant.id().toString(), variant.tenantId().toString(), variant.photoId().toString(),
                variant.storageObjectId().toString(), variant.kind().name(), variant.objectKey(), variant.mimeType(),
                variant.byteSize(), variant.width(), variant.height(), variant.sha256(), variant.status().name(),
                MyBatisValueMapper.localDateTime(variant.createdAt()), MyBatisValueMapper.localDateTime(variant.updatedAt()));
        return variant;
    }

    @Override
    public List<PhotoAssetVariant> findByPhoto(UUID tenantId, UUID photoId) {
        return mapper.findByPhoto(tenantId.toString(), photoId.toString()).stream().map(this::toDomain).toList();
    }

    @Override
    public Optional<PhotoAssetVariant> findReadyByPhotoAndKind(UUID tenantId, UUID photoId, VariantKind kind) {
        Map<String, Object> row = mapper.findReady(tenantId.toString(), photoId.toString(), kind.name());
        return row == null ? Optional.empty() : Optional.of(toDomain(row));
    }

    @Override
    public int markFailed(UUID tenantId, UUID photoId, VariantKind kind) {
        return mapper.markFailed(tenantId.toString(), photoId.toString(), kind.name(), MyBatisValueMapper.localDateTime(Instant.now()));
    }

    @Override
    public int softDelete(UUID tenantId, UUID photoId, VariantKind kind) {
        return mapper.softDelete(tenantId.toString(), photoId.toString(), kind.name(), MyBatisValueMapper.localDateTime(Instant.now()));
    }

    private PhotoAssetVariant toDomain(Map<String, Object> row) {
        return new PhotoAssetVariant(MyBatisValueMapper.uuid(row, "id"), MyBatisValueMapper.uuid(row, "tenantId"),
                MyBatisValueMapper.uuid(row, "photoId"), MyBatisValueMapper.uuid(row, "storageObjectId"),
                VariantKind.valueOf(row.get("kind").toString()), (String) row.get("objectKey"), (String) row.get("mimeType"),
                ((Number) row.get("byteSize")).longValue(), ((Number) row.get("width")).intValue(), ((Number) row.get("height")).intValue(),
                (String) row.get("sha256"), VariantStatus.valueOf(row.get("status").toString()),
                MyBatisValueMapper.instant(row, "createdAt"), MyBatisValueMapper.instant(row, "updatedAt"));
    }
}
