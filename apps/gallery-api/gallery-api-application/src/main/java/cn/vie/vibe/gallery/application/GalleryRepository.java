package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.Gallery;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GalleryRepository {
    List<Gallery> findAll(UUID tenantId);
    Optional<Gallery> findByTenantAndSlug(UUID tenantId, String slug);
    Optional<Gallery> findBySlug(String slug);
    Gallery save(Gallery gallery);
}
