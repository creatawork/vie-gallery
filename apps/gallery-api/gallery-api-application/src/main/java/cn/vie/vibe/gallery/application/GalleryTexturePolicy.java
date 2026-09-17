package cn.vie.vibe.gallery.application;

import java.util.UUID;

public interface GalleryTexturePolicy {
    boolean shouldGenerate(UUID tenantId, UUID galleryId);
}
