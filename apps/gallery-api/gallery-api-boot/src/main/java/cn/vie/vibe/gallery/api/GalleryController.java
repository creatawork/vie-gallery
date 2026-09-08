package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.GalleryFacade;
import cn.vie.vibe.gallery.application.PhotoRepository;
import cn.vie.vibe.gallery.application.StorageObjectRepository;
import cn.vie.vibe.gallery.application.ObjectStoragePort;
import cn.vie.vibe.gallery.application.TenantContextResolver;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import cn.vie.vibe.gallery.domain.StorageObjectStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/galleries")
public class GalleryController {
    private final GalleryFacade facade;
    private final PhotoRepository photos;
    private final StorageObjectRepository objects;
    private final ObjectStoragePort storage;
    private final TenantContextResolver tenantContext;

    public GalleryController(GalleryFacade facade, PhotoRepository photos, StorageObjectRepository objects, ObjectStoragePort storage, TenantContextResolver tenantContext) {
        this.facade = facade;
        this.photos = photos;
        this.objects = objects;
        this.storage = storage;
        this.tenantContext = tenantContext;
    }

    @GetMapping public List<GalleryResponse> list() {
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
        if (gallery.coverPhotoId() != null) {
            coverUrl = photos.findById(tenant, gallery.coverPhotoId())
                    .filter(p -> p.status() == PhotoStatus.READY)
                    .flatMap(p -> objects.findById(tenant, p.storageObjectId()))
                    .filter(o -> o.status() == StorageObjectStatus.READY)
                    .map(o -> storage.createReadUrl(o.thumbnailKey() != null ? o.thumbnailKey() : o.objectKey(), ObjectStoragePort.DEFAULT_READ_URL_TTL).toString())
                    .orElse(null);
        }
        return GalleryResponse.from(gallery, coverUrl);
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

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GalleryResponse create(@Valid @RequestBody CreateGalleryRequest request) {
        return GalleryResponse.from(facade.create(request.name().trim(), request.slug().trim(), request.visibility()), null);
    }

    public record CreateGalleryRequest(@NotBlank @Size(max = 160) String name,
                                       @NotBlank @Size(max = 80) String slug,
                                       GalleryVisibility visibility) {
        public CreateGalleryRequest { if (visibility == null) visibility = GalleryVisibility.PRIVATE; }
    }

    public record SetPasswordRequest(@NotBlank @Size(min = 6, max = 128) String password) {
    }

    public record GalleryResponse(String id, String slug, String name, GalleryVisibility visibility,
                                  cn.vie.vibe.gallery.domain.GalleryStatus status, java.time.Instant publishedAt,
                                  String coverPhotoId, String coverThumbnailUrl,
                                  java.time.Instant createdAt) {
        static GalleryResponse from(Gallery gallery, String coverThumbnailUrl) {
            return new GalleryResponse(gallery.id().toString(), gallery.slug(), gallery.name(),
                    gallery.visibility(), gallery.status(), gallery.publishedAt(),
                    gallery.coverPhotoId() != null ? gallery.coverPhotoId().toString() : null,
                    coverThumbnailUrl, gallery.createdAt());
        }
    }
}
