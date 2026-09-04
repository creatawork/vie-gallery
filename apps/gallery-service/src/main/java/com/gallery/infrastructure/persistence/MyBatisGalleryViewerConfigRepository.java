package com.gallery.infrastructure.persistence;

import com.gallery.application.GalleryViewerConfigRepository;
import com.gallery.domain.GalleryViewerConfig;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * MyBatis 实现的相册展示配置仓储
 */
@Repository
public class MyBatisGalleryViewerConfigRepository implements GalleryViewerConfigRepository {
    private final GalleryViewerConfigMapper mapper;

    public MyBatisGalleryViewerConfigRepository(GalleryViewerConfigMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public Optional<GalleryViewerConfig> findByGalleryId(UUID galleryId) {
        return mapper.findByGalleryId(galleryId.toString());
    }

    @Override
    public GalleryViewerConfig save(GalleryViewerConfig config) {
        // 检查是否存在
        var existing = mapper.findByGalleryId(config.galleryId().toString());

        if (existing.isPresent()) {
            // 更新
            mapper.update(config);
        } else {
            // 创建
            mapper.insert(config);
        }

        return config;
    }

    @Override
    public int deleteByGalleryId(UUID galleryId) {
        return mapper.deleteByGalleryId(galleryId.toString());
    }
}
