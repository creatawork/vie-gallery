package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.GalleryStatus;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.Photo;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import cn.vie.vibe.gallery.domain.StorageObjectStatus;
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
    void nonOwnerCannotCreateGallery() {
        UUID tenantId = UUID.randomUUID();
        GalleryFacade facade = new GalleryFacade(new InMemoryRepository(),
                () -> new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.EDITOR));

        DomainException exception = assertThrows(DomainException.class,
                () -> facade.create("Wedding", "wedding", GalleryVisibility.PRIVATE));

        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, exception.code());
    }

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

    @Test
    void createStartsAsDraftWithoutPublicationTime() {
        UUID tenantId = UUID.randomUUID();
        InMemoryRepository repository = new InMemoryRepository();
        GalleryFacade facade = new GalleryFacade(repository,
                () -> new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));

        Gallery created = facade.create("Wedding", "wedding", GalleryVisibility.PUBLIC);

        assertEquals(GalleryStatus.DRAFT, created.status());
        assertEquals(null, created.publishedAt());
    }

    @Test
    void publishRequiresReadyPhotoAndIsIdempotent() {
        UUID tenantId = UUID.randomUUID();
        InMemoryRepository repository = new InMemoryRepository();
        InMemoryPhotoRepository photos = new InMemoryPhotoRepository(0);
        GalleryFacade facade = new GalleryFacade(repository,
                () -> new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER), photos);
        Gallery gallery = facade.create("Wedding", "wedding", GalleryVisibility.PUBLIC);

        DomainException notReady = assertThrows(DomainException.class, () -> facade.publish(gallery.id()));
        assertEquals("GALLERY_NOT_READY", notReady.code());
        photos.ready = 1;
        Gallery published = facade.publish(gallery.id());
        assertEquals(GalleryStatus.PUBLISHED, published.status());
        assertEquals(tenantId, published.tenantId());
        assertEquals(published, facade.publish(gallery.id()));
    }

    @Test
    void unpublishReturnsDraftAndArchivedCannotChange() {
        UUID tenantId = UUID.randomUUID();
        InMemoryRepository repository = new InMemoryRepository();
        InMemoryPhotoRepository photos = new InMemoryPhotoRepository(1);
        GalleryFacade facade = new GalleryFacade(repository,
                () -> new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER), photos);
        Gallery gallery = facade.create("Wedding", "wedding", GalleryVisibility.PUBLIC);
        assertEquals(GalleryStatus.DRAFT, facade.unpublish(gallery.id()).status());
        Gallery published = facade.publish(gallery.id());
        repository.update(new Gallery(published.id(), published.tenantId(), published.slug(), published.name(),
                published.visibility(), published.passwordHash(), published.coverPhotoId(), published.deleted(),
                published.createdAt(), GalleryStatus.ARCHIVED, published.publishedAt()));
        DomainException conflict = assertThrows(DomainException.class, () -> facade.publish(gallery.id()));
        assertEquals("GALLERY_ALREADY_ARCHIVED", conflict.code());
    }

    @Test
    void getReturnsGalleryFromCurrentTenant() {
        UUID tenantId = UUID.randomUUID();
        InMemoryRepository repository = new InMemoryRepository();
        GalleryFacade facade = new GalleryFacade(repository,
                () -> new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));
        Gallery created = facade.create("Wedding", "wedding", GalleryVisibility.PRIVATE);

        assertEquals(created, facade.get(created.id()));
    }

    @Test
    void getRejectsGalleryOutsideCurrentTenantAsNotFound() {
        UUID ownerTenant = UUID.randomUUID();
        UUID currentTenant = UUID.randomUUID();
        InMemoryRepository repository = new InMemoryRepository();
        GalleryFacade ownerFacade = new GalleryFacade(repository,
                () -> new TenantContext(UUID.randomUUID(), ownerTenant, MembershipRole.OWNER));
        Gallery created = ownerFacade.create("Wedding", "wedding", GalleryVisibility.PRIVATE);
        GalleryFacade currentTenantFacade = new GalleryFacade(repository,
                () -> new TenantContext(UUID.randomUUID(), currentTenant, MembershipRole.OWNER));

        DomainException exception = assertThrows(DomainException.class,
                () -> currentTenantFacade.get(created.id()));
        assertEquals("GALLERY_NOT_FOUND", exception.code());
    }

    @Test
    void updateVisibilityChangesVisibilityAndClearsPasswordHashWhenNotPassword() {
        UUID tenantId = UUID.randomUUID();
        InMemoryRepository repository = new InMemoryRepository();
        GalleryFacade facade = new GalleryFacade(repository,
                () -> new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER),
                null, new WorkspaceAuthorizationPolicy(() -> new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER)),
                new PasswordHasher() {
                    public String hash(String raw) { return "hash:" + raw; }
                    public boolean matches(String raw, String hash) { return hash.equals("hash:" + raw); }
                });
        Gallery created = facade.create("Wedding", "wedding", GalleryVisibility.PASSWORD);
        facade.setPassword(created.id(), "secret123");

        Gallery passwordGallery = facade.get(created.id());
        assertEquals("hash:secret123", passwordGallery.passwordHash());

        Gallery updatedToPublic = facade.updateVisibility(created.id(), GalleryVisibility.PUBLIC);
        assertEquals(GalleryVisibility.PUBLIC, updatedToPublic.visibility());
        assertEquals(null, updatedToPublic.passwordHash());

        Gallery updatedBackToPassword = facade.updateVisibility(created.id(), GalleryVisibility.PASSWORD);
        assertEquals(GalleryVisibility.PASSWORD, updatedBackToPassword.visibility());
    }

    private static final class InMemoryPhotoRepository implements PhotoRepository {
        int ready;
        InMemoryPhotoRepository(int ready) { this.ready = ready; }
        public Photo save(Photo photo) { return photo; }
        public List<Photo> findByGallery(UUID tenantId, UUID galleryId) { return List.of(); }
        public Optional<Photo> findById(UUID tenantId, UUID photoId) { return Optional.empty(); }
        public Optional<Photo> findById(UUID photoId) { return Optional.empty(); }
        public int countByGalleryId(UUID galleryId) { return ready; }
        public List<Photo> findByGalleryIdWithPagination(UUID galleryId, int offset, int limit) { return List.of(); }
        public List<Photo> findPublicReadyByGalleryId(UUID tenantId, UUID galleryId, int offset, int limit) { return List.of(); }
        public int countPublicReadyByGalleryId(UUID tenantId, UUID galleryId) { return ready; }
        public int countFailedByGalleryId(UUID tenantId, UUID galleryId) { return 0; }
        public int updateStatus(UUID tenantId, UUID photoId, PhotoStatus status) { return 0; }
        public int updateMetadata(UUID tenantId, UUID photoId, String title, Integer sortOrder, Boolean cover) { return 0; }
        public int clearCoverByGallery(UUID tenantId, UUID galleryId) { return 0; }
        public int softDelete(UUID tenantId, UUID photoId) { return 0; }
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
        public Optional<Gallery> findById(UUID tenantId, UUID galleryId) {
            return values.stream().filter(g -> g.tenantId().equals(tenantId) && g.id().equals(galleryId)).findFirst();
        }
        public Gallery save(Gallery gallery) { values.add(gallery); return gallery; }
        public void update(Gallery gallery) {
            values.removeIf(g -> g.id().equals(gallery.id()));
            values.add(gallery);
        }
        public void updateCoverPhoto(UUID tenantId, UUID galleryId, UUID coverPhotoId) {
            findById(tenantId, galleryId).ifPresent(g -> {
                values.remove(g);
                values.add(new Gallery(g.id(), g.tenantId(), g.slug(), g.name(), g.visibility(), g.passwordHash(), coverPhotoId, g.deleted(), g.createdAt()));
            });
        }
    }
}
