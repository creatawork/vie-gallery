package com.gallery.application;

import com.gallery.domain.GalleryViewerConfig;

import java.util.Optional;
import java.util.UUID;

/**
 * 相册展示配置仓储
 */
public interface GalleryViewerConfigRepository {
    /**
     * 根据相册ID查找配置
     */
    Optional<GalleryViewerConfig> findByGalleryId(UUID galleryId);

    /**
     * 保存配置（创建或更新）
     */
    GalleryViewerConfig save(GalleryViewerConfig config);

    /**
     * 删除相册的配置
     *
     * @return 删除的行数
     */
    int deleteByGalleryId(UUID galleryId);
}
