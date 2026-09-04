package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.GalleryViewerConfig;

import java.util.Optional;
import java.util.UUID;

public interface GalleryViewerConfigRepository {
    Optional<GalleryViewerConfig> findByGalleryId(UUID galleryId);
    void save(GalleryViewerConfig config);
    int deleteByGalleryId(UUID galleryId);
}
