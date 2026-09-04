package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.GalleryViewerConfigRepository;
import cn.vie.vibe.gallery.domain.GalleryViewerConfig;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.GalleryViewerConfigMapper;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Repository
@Profile("!dev-memory")
public class MyBatisGalleryViewerConfigRepository implements GalleryViewerConfigRepository {
    private final GalleryViewerConfigMapper mapper;

    public MyBatisGalleryViewerConfigRepository(GalleryViewerConfigMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public Optional<GalleryViewerConfig> findByGalleryId(UUID galleryId) {
        Map<String, Object> row = mapper.findByGalleryId(galleryId.toString());
        if (row == null) return Optional.empty();

        Boolean enabled = (Boolean) row.get("enabled");
        return Optional.of(new GalleryViewerConfig(
                MyBatisValueMapper.uuid(row, "id"),
                MyBatisValueMapper.uuid(row, "galleryId"),
                (String) row.get("configJson"),
                enabled != null && enabled,
                (String) row.get("presetName"),
                MyBatisValueMapper.instant(row, "createdAt"),
                MyBatisValueMapper.instant(row, "updatedAt")
        ));
    }

    @Override
    public void save(GalleryViewerConfig config) {
        mapper.upsert(
                config.id().toString(),
                config.galleryId().toString(),
                config.configJson(),
                config.enabled(),
                config.presetName(),
                MyBatisValueMapper.localDateTime(config.createdAt()),
                MyBatisValueMapper.localDateTime(config.updatedAt())
        );
    }

    @Override
    public int deleteByGalleryId(UUID galleryId) {
        return mapper.deleteByGalleryId(galleryId.toString());
    }
}
