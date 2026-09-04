package com.gallery.boot.api;

import com.gallery.application.GalleryViewerConfigFacade;
import com.gallery.domain.GalleryViewerConfig;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * 相册展示配置 API（管理端）
 */
@RestController
@RequestMapping("/api/galleries/{galleryId}/viewer-config")
public class GalleryViewerConfigController {

    private final GalleryViewerConfigFacade configFacade;

    public GalleryViewerConfigController(GalleryViewerConfigFacade configFacade) {
        this.configFacade = configFacade;
    }

    /**
     * 获取相册配置
     */
    @GetMapping
    public ResponseEntity<GalleryViewerConfigResponse> getConfig(@PathVariable UUID galleryId) {
        return configFacade.getConfig(galleryId)
            .map(config -> ResponseEntity.ok(GalleryViewerConfigResponse.from(config)))
            .orElse(ResponseEntity.notFound().build());
    }

    /**
     * 保存相册配置
     */
    @PutMapping
    public ResponseEntity<GalleryViewerConfigResponse> saveConfig(
        @PathVariable UUID galleryId,
        @RequestBody SaveConfigRequest request
    ) {
        var config = configFacade.saveConfig(
            galleryId,
            request.configJson(),
            request.presetName()
        );
        return ResponseEntity.ok(GalleryViewerConfigResponse.from(config));
    }

    /**
     * 删除配置（恢复默认）
     */
    @DeleteMapping
    public ResponseEntity<Void> deleteConfig(@PathVariable UUID galleryId) {
        configFacade.deleteConfig(galleryId);
        return ResponseEntity.noContent().build();
    }

    /**
     * 启用/禁用配置
     */
    @PatchMapping("/toggle")
    public ResponseEntity<Void> toggleConfig(
        @PathVariable UUID galleryId,
        @RequestBody ToggleConfigRequest request
    ) {
        configFacade.toggleConfig(galleryId, request.enabled());
        return ResponseEntity.noContent().build();
    }
}

/**
 * 保存配置请求
 */
record SaveConfigRequest(
    String configJson,
    String presetName
) {}

/**
 * 切换启用状态请求
 */
record ToggleConfigRequest(
    boolean enabled
) {}

/**
 * 配置响应
 */
record GalleryViewerConfigResponse(
    String id,
    String galleryId,
    String configJson,
    boolean enabled,
    String presetName,
    String createdAt,
    String updatedAt
) {
    static GalleryViewerConfigResponse from(GalleryViewerConfig config) {
        return new GalleryViewerConfigResponse(
            config.id().toString(),
            config.galleryId().toString(),
            config.configJson(),
            config.enabled(),
            config.presetName(),
            config.createdAt().toString(),
            config.updatedAt().toString()
        );
    }
}
