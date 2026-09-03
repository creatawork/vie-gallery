package cn.vie.vibe.gallery.application;
import cn.vie.vibe.gallery.domain.Gallery;
import java.util.Optional;
import java.util.UUID;
public interface GalleryLookup { Optional<Gallery> findById(UUID tenantId, UUID galleryId); }
