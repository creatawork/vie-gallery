package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.TenantContext;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class GalleryFacadeTest {
    @Test
    void createNormalizesSlugAndUsesCurrentTenant() {
        UUID tenantId = UUID.randomUUID();
        InMemoryRepository repository = new InMemoryRepository();
        GalleryFacade facade = new GalleryFacade(repository,
                () -> new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));

        Gallery created = facade.create("Wedding", " WEDDING ", GalleryVisibility.PRIVATE);

        assertEquals("wedding", created.slug());
        assertEquals(tenantId, created.tenantId());
        assertEquals(1, repository.values.size());
    }

    @Test
    void duplicateSlugIsRejectedWithinTenant() {
        UUID tenantId = UUID.randomUUID();
        InMemoryRepository repository = new InMemoryRepository();
        GalleryFacade facade = new GalleryFacade(repository,
                () -> new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));
        facade.create("One", "same", GalleryVisibility.PRIVATE);

        DomainException exception = assertThrows(DomainException.class,
                () -> facade.create("Two", "same", GalleryVisibility.PRIVATE));
        assertEquals("GALLERY_SLUG_CONFLICT", exception.code());
    }

    private static final class InMemoryRepository implements GalleryRepository {
        final List<Gallery> values = new ArrayList<>();
        public List<Gallery> findAll(UUID tenantId) { return values; }
        public Optional<Gallery> findByTenantAndSlug(UUID tenantId, String slug) {
            return values.stream().filter(g -> g.tenantId().equals(tenantId) && g.slug().equals(slug)).findFirst();
        }
        public Optional<Gallery> findBySlug(String slug) {
            return values.stream().filter(g -> g.slug().equals(slug)).findFirst();
        }
        public Optional<Gallery> findById(UUID galleryId) {
            return values.stream().filter(g -> g.id().equals(galleryId)).findFirst();
        }
        public Gallery save(Gallery gallery) { values.add(gallery); return gallery; }
        public void update(Gallery gallery) {
            values.removeIf(g -> g.id().equals(gallery.id()));
            values.add(gallery);
        }
    }
}
