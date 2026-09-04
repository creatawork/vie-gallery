package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryViewerConfig;
import cn.vie.vibe.gallery.domain.TenantContext;

import java.util.Optional;
import java.util.UUID;

public class GalleryViewerConfigFacade {
    private final GalleryViewerConfigRepository configRepository;
    private final GalleryRepository galleryRepository;

    public GalleryViewerConfigFacade(
            GalleryViewerConfigRepository configRepository,
            GalleryRepository galleryRepository
    ) {
        this.configRepository = configRepository;
        this.galleryRepository = galleryRepository;
    }

    /**
     * 获取公开展示配置（按相册 slug）
     */
    public Optional<GalleryViewerConfig> getPublicConfig(String slug) {
        return galleryRepository.findBySlug(slug)
                .filter(g -> !g.deleted())
                .flatMap(g -> configRepository.findByGalleryId(g.id()))
                .filter(GalleryViewerConfig::enabled);
    }

    /**
     * 获取管理配置
     */
    public Optional<GalleryViewerConfig> getConfig(UUID galleryId) {
        TenantContext context = TenantContextHolder.current();
        galleryRepository.findById(galleryId)
                .filter(g -> g.tenantId().equals(context.tenantId()))
                .filter(g -> !g.deleted())
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));

        return configRepository.findByGalleryId(galleryId);
    }

    /**
     * 保存或更新配置
     */
    public GalleryViewerConfig saveConfig(UUID galleryId, String configJson, String presetName) {
        TenantContext context = TenantContextHolder.current();
        galleryRepository.findById(galleryId)
                .filter(g -> g.tenantId().equals(context.tenantId()))
                .filter(g -> !g.deleted())
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));

        GalleryViewerConfig config = configRepository.findByGalleryId(galleryId)
                .map(existing -> existing.withUpdate(configJson, presetName))
                .orElseGet(() -> GalleryViewerConfig.create(galleryId, configJson, presetName));

        configRepository.save(config);
        return config;
    }

    /**
     * 删除配置（恢复默认）
     */
    public void deleteConfig(UUID galleryId) {
        TenantContext context = TenantContextHolder.current();
        galleryRepository.findById(galleryId)
                .filter(g -> g.tenantId().equals(context.tenantId()))
                .filter(g -> !g.deleted())
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));

        configRepository.deleteByGalleryId(galleryId);
    }

    /**
     * 切换配置启用状态
     */
    public void toggleConfig(UUID galleryId, boolean enabled) {
        TenantContext context = TenantContextHolder.current();
        galleryRepository.findById(galleryId)
                .filter(g -> g.tenantId().equals(context.tenantId()))
                .filter(g -> !g.deleted())
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));

        configRepository.findByGalleryId(galleryId)
                .ifPresent(config -> configRepository.save(config.withEnabled(enabled)));
    }
}
