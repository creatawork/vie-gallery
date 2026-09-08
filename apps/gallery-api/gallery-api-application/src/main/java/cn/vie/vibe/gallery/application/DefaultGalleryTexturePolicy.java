package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.GalleryViewerConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Locale;
import java.util.UUID;

public class DefaultGalleryTexturePolicy implements GalleryTexturePolicy {
    private static final Logger log = LoggerFactory.getLogger(DefaultGalleryTexturePolicy.class);
    private final GalleryViewerConfigRepository configs;
    private final GalleryRepository galleries;

    public DefaultGalleryTexturePolicy(GalleryViewerConfigRepository configs, GalleryRepository galleries) {
        this.configs = configs;
        this.galleries = galleries;
    }

    @Override
    public boolean shouldGenerate(UUID tenantId, UUID galleryId) {
        return galleries.findById(tenantId, galleryId)
                .flatMap(gallery -> configs.findByGalleryId(gallery.id()))
                .map(this::isThreeDimensional)
                .orElse(false);
    }

    private boolean isThreeDimensional(GalleryViewerConfig config) {
        String json = config.configJson();
        if (json == null || json.isBlank()) return false;
        String normalized = json.toLowerCase(Locale.ROOT);
        if (normalized.contains("\"viewmode\":\"2d\"") || normalized.contains("\"mode\":\"2d\"")) return false;
        if (normalized.contains("\"viewmode\":\"3d\"") || normalized.contains("\"mode\":\"3d\"")) return true;
        return normalized.contains("\"layout\":{\"mode\":\"sphere\"")
                || normalized.contains("\"layout\":{\"mode\":\"helix\"")
                || normalized.contains("\"layout\":{\"mode\":\"spiral\"");
    }
}
