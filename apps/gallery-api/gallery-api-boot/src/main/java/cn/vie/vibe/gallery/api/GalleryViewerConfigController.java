package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.GalleryViewerConfigFacade;
import cn.vie.vibe.gallery.application.ViewerConfigVersionPage;
import cn.vie.vibe.gallery.domain.GalleryViewerConfig;
import cn.vie.vibe.gallery.domain.ViewerConfigVersion;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/galleries/{galleryId}/viewer-config")
public class GalleryViewerConfigController {
    private final GalleryViewerConfigFacade configFacade;

    public GalleryViewerConfigController(GalleryViewerConfigFacade configFacade) {
        this.configFacade = configFacade;
    }

    @GetMapping
    public ResponseEntity<GalleryViewerConfigResponse> getConfig(@PathVariable("galleryId") String galleryId) {
        return configFacade.getConfig(UUID.fromString(galleryId))
                .map(this::toResponse)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).build());
    }

    @PutMapping
    public ResponseEntity<GalleryViewerConfigResponse> saveConfig(
            @PathVariable("galleryId") String galleryId,
            @Valid @RequestBody SaveConfigRequest request
    ) {
        GalleryViewerConfig config = configFacade.saveConfig(
                UUID.fromString(galleryId), request.configJson(), request.presetName(), request.schemaVersion());
        return ResponseEntity.ok(toResponse(config));
    }

    @PostMapping("/publish")
    public ResponseEntity<VersionResponse> publishConfig(
            @PathVariable("galleryId") String galleryId,
            @RequestBody(required = false) PublishConfigRequest request
    ) {
        Integer schemaVersion = request == null ? null : request.schemaVersion();
        return ResponseEntity.ok(toVersionResponse(configFacade.publishConfig(UUID.fromString(galleryId), schemaVersion)));
    }

    @GetMapping("/versions")
    public VersionPageResponse listVersions(
            @PathVariable("galleryId") String galleryId,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize
    ) {
        return toVersionPage(configFacade.listVersions(UUID.fromString(galleryId), page, pageSize));
    }

    @PostMapping("/rollback")
    public ResponseEntity<VersionResponse> rollbackConfig(
            @PathVariable("galleryId") String galleryId,
            @Valid @RequestBody RollbackConfigRequest request
    ) {
        return ResponseEntity.ok(toVersionResponse(configFacade.rollbackConfig(
                UUID.fromString(galleryId), UUID.fromString(request.versionId()))));
    }

    @DeleteMapping
    public ResponseEntity<Void> deleteConfig(@PathVariable("galleryId") String galleryId) {
        configFacade.deleteConfig(UUID.fromString(galleryId));
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/toggle")
    public ResponseEntity<Void> toggleConfig(
            @PathVariable("galleryId") String galleryId,
            @Valid @RequestBody ToggleConfigRequest request
    ) {
        configFacade.toggleConfig(UUID.fromString(galleryId), request.enabled());
        return ResponseEntity.noContent().build();
    }

    private GalleryViewerConfigResponse toResponse(GalleryViewerConfig config) {
        return new GalleryViewerConfigResponse(
                config.id().toString(), config.galleryId().toString(), config.configJson(), config.enabled(),
                config.presetName(), config.createdAt(), config.updatedAt(), config.schemaVersion(),
                config.updatedByUserId() == null ? null : config.updatedByUserId().toString(),
                config.lastPublishedAt(), config.publishedVersionId() == null ? null : config.publishedVersionId().toString());
    }

    private VersionPageResponse toVersionPage(ViewerConfigVersionPage page) {
        return new VersionPageResponse(page.items().stream().map(this::toVersionResponse).toList(), page.page(), page.pageSize(), page.total());
    }

    private VersionResponse toVersionResponse(ViewerConfigVersion version) {
        return new VersionResponse(version.id().toString(), version.galleryId().toString(), version.configJson(),
                version.presetName(), version.schemaVersion(), version.createdAt(),
                version.createdByUserId() == null ? null : version.createdByUserId().toString());
    }

    public record SaveConfigRequest(@NotBlank String configJson, String presetName, Integer schemaVersion) {}
    public record PublishConfigRequest(Integer schemaVersion) {}
    public record RollbackConfigRequest(@NotBlank String versionId) {}
    public record ToggleConfigRequest(boolean enabled) {}

    public record GalleryViewerConfigResponse(
            String id, String galleryId, String configJson, boolean enabled, String presetName,
            Instant createdAt, Instant updatedAt, int schemaVersion, String updatedByUserId,
            Instant lastPublishedAt, String publishedVersionId
    ) {
        public GalleryViewerConfigResponse(
                String id, String galleryId, String configJson, boolean enabled, String presetName,
                Instant createdAt, Instant updatedAt
        ) {
            this(id, galleryId, configJson, enabled, presetName, createdAt, updatedAt,
                    GalleryViewerConfig.CURRENT_SCHEMA_VERSION, null, null, null);
        }
    }

    public record VersionResponse(
            String id, String galleryId, String configJson, String presetName,
            int schemaVersion, Instant createdAt, String createdByUserId
    ) {}

    public record VersionPageResponse(List<VersionResponse> items, int page, int pageSize, long total) {}
}
