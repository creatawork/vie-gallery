package com.gallery.domain;

import java.time.Instant;
import java.util.UUID;

/**
 * 相册展示配置
 * 存储每个相册的视觉配置（布局、背景、特效等）
 */
public record GalleryViewerConfig(
    UUID id,
    UUID galleryId,
    String configJson,  // JSON 字符串
    boolean enabled,
    String presetName,
    Instant createdAt,
    Instant updatedAt
) {
    /**
     * 创建新配置
     */
    public static GalleryViewerConfig create(UUID galleryId, String configJson, String presetName) {
        Instant now = Instant.now();
        return new GalleryViewerConfig(
            UUID.randomUUID(),
            galleryId,
            configJson,
            true,
            presetName,
            now,
            now
        );
    }

    /**
     * 更新配置
     */
    public GalleryViewerConfig withUpdate(String configJson, String presetName) {
        return new GalleryViewerConfig(
            this.id,
            this.galleryId,
            configJson,
            this.enabled,
            presetName,
            this.createdAt,
            Instant.now()
        );
    }

    /**
     * 切换启用状态
     */
    public GalleryViewerConfig withEnabled(boolean enabled) {
        return new GalleryViewerConfig(
            this.id,
            this.galleryId,
            this.configJson,
            enabled,
            this.presetName,
            this.createdAt,
            Instant.now()
        );
    }
}
