package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.application.GalleryRepository;
import cn.vie.vibe.gallery.domain.Gallery;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

@Repository
@Profile("dev-memory")
public class InMemoryGalleryRepository implements GalleryRepository {
    private final List<Gallery> values = new CopyOnWriteArrayList<>();

    @Override public List<Gallery> findAll(UUID tenantId) {
        return values.stream().filter(item -> item.tenantId().equals(tenantId) && !item.deleted()).toList();
    }

    @Override public Optional<Gallery> findBySlug(String slug) {
        return values.stream().filter(item -> item.slug().equals(slug) && !item.deleted()).findFirst();
    }

    @Override public Optional<Gallery> findByTenantAndSlug(UUID tenantId, String slug) {
        return values.stream().filter(item -> item.tenantId().equals(tenantId)
                && item.slug().equals(slug) && !item.deleted()).findFirst();
    }

    @Override public Gallery save(Gallery gallery) {
        values.add(gallery);
        return gallery;
    }
}
