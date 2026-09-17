package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.*;
import cn.vie.vibe.gallery.domain.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/galleries")
public class GalleryController {
    private final GalleryFacade facade;
    private final PhotoRepository photos;
    private final StorageObjectRepository objects;
    private final ObjectStoragePort storage;
    private final TenantContextResolver tenantContext;
    private final CreatorPreviewTokens previewTokens;
    private final PhotoProcessingTaskRepository tasks;
    private final GalleryViewerConfigRepository configs;

    public GalleryController(
            GalleryFacade facade,
            PhotoRepository photos,
            StorageObjectRepository objects,
            ObjectStoragePort storage,
            TenantContextResolver tenantContext,
            CreatorPreviewTokens previewTokens
    ) {
        this(facade, photos, objects, storage, tenantContext, previewTokens, null, null);
    }

    @Autowired
    public GalleryController(
            GalleryFacade facade,
            PhotoRepository photos,
            StorageObjectRepository objects,
            ObjectStoragePort storage,
            TenantContextResolver tenantContext,
            CreatorPreviewTokens previewTokens,
            PhotoProcessingTaskRepository tasks,
            GalleryViewerConfigRepository configs
    ) {
        this.facade = facade;
        this.photos = photos;
        this.objects = objects;
        this.storage = storage;
        this.tenantContext = tenantContext;
        this.previewTokens = previewTokens;
        this.tasks = tasks;
        this.configs = configs;
    }

    @GetMapping
    public List<GalleryResponse> list() {
        UUID tenant = tenantContext.requireContext().tenantId();
        return facade.list().stream().map(g -> toResponse(g, tenant)).toList();
    }

    @GetMapping("/{galleryId}")
    public GalleryResponse get(@PathVariable UUID galleryId) {
        UUID tenant = tenantContext.requireContext().tenantId();
        return toResponse(facade.get(galleryId), tenant);
    }

    private GalleryResponse toResponse(Gallery gallery, UUID tenant) {
        String coverUrl = null;
        if (gallery.coverPhotoId() != null && photos != null && objects != null && storage != null) {
            coverUrl = photos.findById(tenant, gallery.coverPhotoId())
                    .filter(p -> p.status() == PhotoStatus.READY)
                    .flatMap(p -> objects.findById(tenant, p.storageObjectId()))
                    .filter(o -> o.status() == StorageObjectStatus.READY)
                    .map(o -> storage.createReadUrl(o.thumbnailKey() != null ? o.thumbnailKey() : o.objectKey(), ObjectStoragePort.DEFAULT_READ_URL_TTL).toString())
                    .orElse(null);
        }

        int photoCount = photos != null ? photos.countPublicReadyByGalleryId(tenant, gallery.id()) : 0;
        TaskSummary taskSummary = tasks != null ? tasks.summaryByGallery(tenant, gallery.id()) : TaskSummary.empty();
        long failedPhotoCount = photos != null ? photos.countFailedByGalleryId(tenant, gallery.id()) : 0;
        long processingCount = taskSummary.queued() + taskSummary.processing() + taskSummary.cancelRequested();

        boolean hasUnpublishedConfig = false;
        if (configs != null) {
            Optional<GalleryViewerConfig> configOpt = configs.findByGalleryId(gallery.id());
            if (configOpt.isPresent()) {
                GalleryViewerConfig config = configOpt.get();
                hasUnpublishedConfig = config.publishedVersionId() == null ||
                        (config.lastPublishedAt() != null && config.updatedAt().isAfter(config.lastPublishedAt()));
            }
        }

        return GalleryResponse.from(gallery, coverUrl, photoCount, failedPhotoCount, processingCount, hasUnpublishedConfig);
    }

    @GetMapping("/{galleryId}/publish-readiness")
    public PublishReadinessResponse getPublishReadiness(@PathVariable UUID galleryId) {
        UUID tenant = tenantContext.requireContext().tenantId();
        Gallery gallery = facade.get(galleryId);
        int readyPhotoCount = photos != null ? photos.countPublicReadyByGalleryId(tenant, galleryId) : 0;

        java.util.List<PublishBlocker> blockers = new java.util.ArrayList<>();
        if (readyPhotoCount < 1) {
            blockers.add(new PublishBlocker("NO_READY_PHOTOS", "展厅中至少需要包含 1 张已处理完成的照片才能发布。"));
        }
        if (gallery.status() == GalleryStatus.ARCHIVED) {
            blockers.add(new PublishBlocker("GALLERY_ARCHIVED", "已归档的展厅无法重新发布。"));
        }

        boolean configDraftChanged = false;
        String publishedVersionId = null;
        String draftVersionId = null;
        Instant lastConfigPublishedAt = null;

        if (configs != null) {
            Optional<GalleryViewerConfig> configOpt = configs.findByGalleryId(galleryId);
            if (configOpt.isPresent()) {
                GalleryViewerConfig cfg = configOpt.get();
                if (cfg.publishedVersionId() != null) {
                    publishedVersionId = cfg.publishedVersionId().toString();
                }
                lastConfigPublishedAt = cfg.lastPublishedAt();
                configDraftChanged = cfg.publishedVersionId() == null ||
                        (cfg.lastPublishedAt() != null && cfg.updatedAt().isAfter(cfg.lastPublishedAt()));
                // Draft content lives on the config row until publish creates a version snapshot.
                draftVersionId = null;
            }
        }

        boolean galleryPublishable = blockers.isEmpty();
        return new PublishReadinessResponse(
                gallery.status(),
                readyPhotoCount,
                galleryPublishable,
                configDraftChanged,
                publishedVersionId,
                draftVersionId,
                gallery.publishedAt(),
                lastConfigPublishedAt,
                blockers
        );
    }

    @PostMapping("/{galleryId}/preview-token")
    public PreviewTokenResponse issuePreviewToken(@PathVariable UUID galleryId) {
        Gallery gallery = facade.get(galleryId);
        CreatorPreviewTokens.IssuedToken issued = previewTokens.issue(gallery.id());
        return new PreviewTokenResponse(issued.token(), issued.expiresAt());
    }

    @PostMapping("/{galleryId}/publish")
    public GalleryResponse publish(@PathVariable UUID galleryId) {
        UUID tenant = tenantContext.requireContext().tenantId();
        return toResponse(facade.publish(galleryId), tenant);
    }

    @PostMapping("/{galleryId}/unpublish")
    public GalleryResponse unpublish(@PathVariable UUID galleryId) {
        UUID tenant = tenantContext.requireContext().tenantId();
        return toResponse(facade.unpublish(galleryId), tenant);
    }

    @PutMapping("/{galleryId}/password")
    public GalleryResponse setPassword(@PathVariable UUID galleryId,
                                       @Valid @RequestBody SetPasswordRequest request) {
        UUID tenant = tenantContext.requireContext().tenantId();
        return toResponse(facade.setPassword(galleryId, request.password()), tenant);
    }

    @DeleteMapping("/{galleryId}/password")
    public GalleryResponse clearPassword(@PathVariable UUID galleryId) {
        UUID tenant = tenantContext.requireContext().tenantId();
        return toResponse(facade.clearPassword(galleryId), tenant);
    }

    @PatchMapping("/{galleryId}")
    public GalleryResponse update(@PathVariable UUID galleryId, @Valid @RequestBody UpdateGalleryRequest request) {
        UUID tenant = tenantContext.requireContext().tenantId();
        Gallery current = facade.get(galleryId);
        if (request.visibility() != null) {
            current = facade.updateVisibility(galleryId, request.visibility());
        }
        return toResponse(current, tenant);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GalleryResponse create(@Valid @RequestBody CreateGalleryRequest request) {
        UUID tenant = tenantContext.requireContext().tenantId();
        return toResponse(facade.create(request.name().trim(), request.slug().trim(), request.visibility()), tenant);
    }

    public record UpdateGalleryRequest(GalleryVisibility visibility) {
    }

    public record CreateGalleryRequest(@NotBlank @Size(max = 160) String name,
                                       @NotBlank @Size(max = 80) String slug,
                                       GalleryVisibility visibility) {
        public CreateGalleryRequest { if (visibility == null) visibility = GalleryVisibility.PRIVATE; }
    }

    public record SetPasswordRequest(@NotBlank @Size(min = 6, max = 128) String password) {
    }

    public record PreviewTokenResponse(String token, Instant expiresAt) {
    }

    public record PublishBlocker(String code, String message) {
    }

    public record PublishReadinessResponse(
            GalleryStatus galleryStatus,
            int readyPhotoCount,
            boolean galleryPublishable,
            boolean configDraftChanged,
            String publishedConfigVersionId,
            String draftConfigVersionId,
            Instant publishedAt,
            Instant lastConfigPublishedAt,
            List<PublishBlocker> blockers
    ) {
    }

    public record GalleryResponse(
            String id,
            String slug,
            String name,
            GalleryVisibility visibility,
            GalleryStatus status,
            Instant publishedAt,
            String coverPhotoId,
            String coverThumbnailUrl,
            Instant createdAt,
            Instant updatedAt,
            int photoCount,
            long failedPhotoCount,
            long processingCount,
            boolean hasUnpublishedConfig
    ) {
        static GalleryResponse from(Gallery gallery, String coverThumbnailUrl, int photoCount,
                                    long failedPhotoCount, long processingCount, boolean hasUnpublishedConfig) {
            return new GalleryResponse(
                    gallery.id().toString(),
                    gallery.slug(),
                    gallery.name(),
                    gallery.visibility(),
                    gallery.status(),
                    gallery.publishedAt(),
                    gallery.coverPhotoId() != null ? gallery.coverPhotoId().toString() : null,
                    coverThumbnailUrl,
                    gallery.createdAt(),
                    gallery.updatedAt() != null ? gallery.updatedAt() : gallery.createdAt(),
                    photoCount,
                    failedPhotoCount,
                    processingCount,
                    hasUnpublishedConfig
            );
        }

        static GalleryResponse from(Gallery gallery, String coverThumbnailUrl) {
            return from(gallery, coverThumbnailUrl, 0, 0, 0, false);
        }
    }
}
