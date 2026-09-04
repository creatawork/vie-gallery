package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.GalleryViewerConfigFacade;
import cn.vie.vibe.gallery.domain.GalleryViewerConfig;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/galleries/{galleryId}/viewer-config")
public class GalleryViewerConfigController {
    private final GalleryViewerConfigFacade configFacade;

    public GalleryViewerConfigController(GalleryViewerConfigFacade configFacade) {
        this.configFacade = configFacade;
    }

    @GetMapping
    public ResponseEntity<GalleryViewerConfigResponse> getConfig(
            @PathVariable("galleryId") String galleryId
    ) {
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
                UUID.fromString(galleryId),
                request.configJson(),
                request.presetName()
        );
        return ResponseEntity.ok(toResponse(config));
    }

    @DeleteMapping
    public ResponseEntity<Void> deleteConfig(
            @PathVariable("galleryId") String galleryId
    ) {
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
                config.id().toString(),
                config.galleryId().toString(),
                config.configJson(),
                config.enabled(),
                config.presetName(),
                config.createdAt(),
                config.updatedAt()
        );
    }

    public record SaveConfigRequest(
            @NotBlank String configJson,
            String presetName
    ) {}

    public record ToggleConfigRequest(
            boolean enabled
    ) {}

    public record GalleryViewerConfigResponse(
            String id,
            String galleryId,
            String configJson,
            boolean enabled,
            String presetName,
            Instant createdAt,
            Instant updatedAt
    ) {}
}
