package com.gallery.application;

import com.gallery.domain.GalleryViewerConfig;
import com.gallery.domain.exception.GalleryNotFoundException;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

/**
 * 相册展示配置 Facade
 */
@Service
public class GalleryViewerConfigFacade {
    private final GalleryViewerConfigRepository configRepository;
    private final GalleryRepository galleryRepository;
    private final TenantContextHolder tenantContext;

    public GalleryViewerConfigFacade(
        GalleryViewerConfigRepository configRepository,
        GalleryRepository galleryRepository,
        TenantContextHolder tenantContext
    ) {
        this.configRepository = configRepository;
        this.galleryRepository = galleryRepository;
        this.tenantContext = tenantContext;
    }

    /**
     * 获取相册的配置（用于公开访问）
     */
    public Optional<String> getPublicConfig(String slug) {
        // 根据 slug 查找相册
        var gallery = galleryRepository.findBySlug(slug)
            .orElseThrow(() -> new GalleryNotFoundException(slug));

        // 查找相册配置
        return configRepository.findByGalleryId(gallery.id())
            .filter(GalleryViewerConfig::enabled)
            .map(GalleryViewerConfig::configJson);
    }

    /**
     * 获取相册配置（管理端）
     */
    public Optional<GalleryViewerConfig> getConfig(UUID galleryId) {
        UUID tenantId = tenantContext.getCurrentTenantId();

        // 验证相册所有权
        galleryRepository.findById(tenantId, galleryId)
            .orElseThrow(() -> new GalleryNotFoundException(galleryId));

        return configRepository.findByGalleryId(galleryId);
    }

    /**
     * 保存相册配置（管理端）
     */
    public GalleryViewerConfig saveConfig(UUID galleryId, String configJson, String presetName) {
        UUID tenantId = tenantContext.getCurrentTenantId();

        // 验证相册所有权
        galleryRepository.findById(tenantId, galleryId)
            .orElseThrow(() -> new GalleryNotFoundException(galleryId));

        // 查找现有配置
        var existing = configRepository.findByGalleryId(galleryId);

        GalleryViewerConfig config;
        if (existing.isPresent()) {
            // 更新现有配置
            config = existing.get().withUpdate(configJson, presetName);
        } else {
            // 创建新配置
            config = GalleryViewerConfig.create(galleryId, configJson, presetName);
        }

        return configRepository.save(config);
    }

    /**
     * 删除配置（恢复默认）
     */
    public void deleteConfig(UUID galleryId) {
        UUID tenantId = tenantContext.getCurrentTenantId();

        // 验证相册所有权
        galleryRepository.findById(tenantId, galleryId)
            .orElseThrow(() -> new GalleryNotFoundException(galleryId));

        configRepository.deleteByGalleryId(galleryId);
    }

    /**
     * 启用/禁用配置
     */
    public void toggleConfig(UUID galleryId, boolean enabled) {
        UUID tenantId = tenantContext.getCurrentTenantId();

        // 验证相册所有权
        galleryRepository.findById(tenantId, galleryId)
            .orElseThrow(() -> new GalleryNotFoundException(galleryId));

        var config = configRepository.findByGalleryId(galleryId)
            .orElseThrow(() -> new GalleryNotFoundException(galleryId));

        var updated = config.withEnabled(enabled);
        configRepository.save(updated);
    }
}
