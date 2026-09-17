package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryViewerConfig;
import cn.vie.vibe.gallery.domain.TenantContext;
import cn.vie.vibe.gallery.domain.ViewerConfigVersion;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public class GalleryViewerConfigFacade {
    private final GalleryViewerConfigRepository configRepository;
    private final ViewerConfigVersionRepository versionRepository;
    private final GalleryRepository galleryRepository;
    private final WorkspaceAuthorizationPolicy authorization;

    public GalleryViewerConfigFacade(
            GalleryViewerConfigRepository configRepository,
            GalleryRepository galleryRepository
    ) {
        this(configRepository, null, galleryRepository, new WorkspaceAuthorizationPolicy(TenantContextHolder::current));
    }

    public GalleryViewerConfigFacade(
            GalleryViewerConfigRepository configRepository,
            GalleryRepository galleryRepository,
            WorkspaceAuthorizationPolicy authorization
    ) {
        this(configRepository, null, galleryRepository, authorization);
    }

    public GalleryViewerConfigFacade(
            GalleryViewerConfigRepository configRepository,
            ViewerConfigVersionRepository versionRepository,
            GalleryRepository galleryRepository,
            WorkspaceAuthorizationPolicy authorization
    ) {
        this.configRepository = configRepository;
        this.versionRepository = versionRepository;
        this.galleryRepository = galleryRepository;
        this.authorization = authorization;
    }

    /** 获取公开展示配置（按相册 slug），默认只返回已发布快照。 */
    public Optional<GalleryViewerConfig> getPublicConfig(String slug) {
        return getPublicConfig(slug, false);
    }

    public Optional<GalleryViewerConfig> getPublicConfig(String slug, boolean includeDraft) {
        Optional<Gallery> gallery = galleryRepository.findBySlug(slug).filter(g -> !g.deleted());
        if (gallery.isEmpty()) return Optional.empty();
        Gallery value = gallery.get();
        if (includeDraft) {
            return configRepository.findByGalleryId(value.id());
        }
        if (versionRepository == null) {
            return configRepository.findByGalleryId(value.id()).filter(GalleryViewerConfig::enabled);
        }
        return versionRepository.findPublishedByGallery(value.tenantId(), value.id())
                .map(version -> configRepository.findByGalleryId(value.id())
                        .map(config -> config.withPublishedSnapshot(version))
                        .orElseGet(() -> new GalleryViewerConfig(
                                version.id(), version.galleryId(), version.configJson(), true,
                                version.presetName(), version.createdAt(), version.createdAt(),
                                version.schemaVersion(), version.createdByUserId(), version.createdAt(), version.id())))
                .filter(GalleryViewerConfig::enabled);
    }

    /** 获取管理端草稿及发布元数据。 */
    public Optional<GalleryViewerConfig> getConfig(UUID galleryId) {
        TenantContext context = authorization.requireViewer();
        requireGallery(context, galleryId);
        return configRepository.findByGalleryId(galleryId);
    }

    /** 保存草稿，不创建版本，不改变公开端。 */
    public GalleryViewerConfig saveConfig(UUID galleryId, String configJson, String presetName, Integer requestedSchemaVersion) {
        TenantContext context = authorization.requireEditor();
        requireSchema(requestedSchemaVersion);
        requireGallery(context, galleryId);
        GalleryViewerConfig config = configRepository.findByGalleryId(galleryId)
                .map(existing -> existing.withUpdate(configJson, presetName, context.userId()))
                .orElseGet(() -> GalleryViewerConfig.create(galleryId, configJson, presetName));
        configRepository.save(config);
        return config;
    }

    public GalleryViewerConfig saveConfig(UUID galleryId, String configJson, String presetName) {
        return saveConfig(galleryId, configJson, presetName, GalleryViewerConfig.CURRENT_SCHEMA_VERSION);
    }

    @Transactional
    public ViewerConfigVersion publishConfig(UUID galleryId, Integer requestedSchemaVersion) {
        TenantContext context = authorization.requireEditor();
        requireSchema(requestedSchemaVersion);
        requireVersioningEnabled();
        requireGallery(context, galleryId);
        GalleryViewerConfig draft = configRepository.findByGalleryId(galleryId)
                .orElseThrow(() -> new DomainException("CONFIG_NOT_FOUND", "Viewer configuration not found"));
        Instant now = Instant.now();
        ViewerConfigVersion version = ViewerConfigVersion.create(
                context.tenantId(), galleryId, draft.configJson(), draft.presetName(),
                draft.schemaVersion(), context.userId());
        versionRepository.save(version);
        if (versionRepository.publish(context.tenantId(), galleryId, version.id(), now) == 0) {
            throw new DomainException("CONFIG_VERSION_PUBLISH_FAILED", "Unable to publish viewer configuration");
        }
        configRepository.save(draft.withPublishedVersion(version.id(), now));
        return version;
    }

    public ViewerConfigVersion publishConfig(UUID galleryId) {
        return publishConfig(galleryId, GalleryViewerConfig.CURRENT_SCHEMA_VERSION);
    }

    public ViewerConfigVersionPage listVersions(UUID galleryId, int page, int pageSize) {
        TenantContext context = authorization.requireViewer();
        requireVersioningEnabled();
        requireGallery(context, galleryId);
        if (page < 0) throw new DomainException("INVALID_PAGE", "Page must be non-negative");
        if (pageSize < 1 || pageSize > 100) throw new DomainException("INVALID_PAGE_SIZE", "Page size must be between 1 and 100");
        int offset = Math.multiplyExact(page, pageSize);
        return new ViewerConfigVersionPage(
                versionRepository.findByGallery(context.tenantId(), galleryId, offset, pageSize),
                page, pageSize, versionRepository.countByGallery(context.tenantId(), galleryId));
    }

    public ViewerConfigVersionPage listVersions(UUID galleryId) {
        return listVersions(galleryId, 0, 20);
    }

    @Transactional
    public ViewerConfigVersion rollbackConfig(UUID galleryId, UUID versionId) {
        TenantContext context = authorization.requireEditor();
        requireVersioningEnabled();
        requireGallery(context, galleryId);
        ViewerConfigVersion source = versionRepository.findById(context.tenantId(), galleryId, versionId)
                .orElseThrow(() -> new DomainException("CONFIG_VERSION_NOT_FOUND", "Viewer configuration version not found"));
        Instant now = Instant.now();
        ViewerConfigVersion rollback = ViewerConfigVersion.create(
                context.tenantId(), galleryId, source.configJson(), source.presetName(), source.schemaVersion(), context.userId());
        versionRepository.save(rollback);
        if (versionRepository.publish(context.tenantId(), galleryId, rollback.id(), now) == 0) {
            throw new DomainException("CONFIG_VERSION_PUBLISH_FAILED", "Unable to publish rolled back configuration");
        }
        GalleryViewerConfig draft = configRepository.findByGalleryId(galleryId)
                .orElseGet(() -> GalleryViewerConfig.create(galleryId, source.configJson(), source.presetName()));
        configRepository.save(draft.withUpdate(source.configJson(), source.presetName(), context.userId())
                .withPublishedVersion(rollback.id(), now));
        return rollback;
    }

    public void deleteConfig(UUID galleryId) {
        TenantContext context = authorization.requireEditor();
        requireGallery(context, galleryId);
        configRepository.deleteByGalleryId(galleryId);
        if (versionRepository != null) versionRepository.clearPublished(context.tenantId(), galleryId);
    }

    public void toggleConfig(UUID galleryId, boolean enabled) {
        TenantContext context = authorization.requireEditor();
        requireGallery(context, galleryId);
        configRepository.findByGalleryId(galleryId).ifPresent(config -> configRepository.save(config.withEnabled(enabled)));
    }

    private void requireVersioningEnabled() {
        if (versionRepository == null) {
            throw new DomainException("CONFIG_VERSIONING_UNAVAILABLE", "Viewer configuration versioning is unavailable");
        }
    }

    private void requireSchema(Integer requestedSchemaVersion) {
        int version = requestedSchemaVersion == null ? GalleryViewerConfig.CURRENT_SCHEMA_VERSION : requestedSchemaVersion;
        if (version != GalleryViewerConfig.CURRENT_SCHEMA_VERSION) {
            throw new DomainException("BAD_SCHEMA_VERSION", "Unsupported viewer configuration schema version");
        }
    }

    private Gallery requireGallery(TenantContext context, UUID galleryId) {
        return galleryRepository.findById(galleryId)
                .filter(g -> g.tenantId().equals(context.tenantId()))
                .filter(g -> !g.deleted())
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));
    }
}
