package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.Photo;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import cn.vie.vibe.gallery.domain.TenantContext;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PhotoFacadeBatchTest {

    @Test
    void reorderPersistsGivenOrder() {
        Fixture fixture = Fixture.create(MembershipRole.OWNER);
        Photo a = fixture.addPhoto("a");
        Photo b = fixture.addPhoto("b");
        Photo c = fixture.addPhoto("c");

        PhotoFacade.ReorderResult result = fixture.facade.reorder(fixture.galleryId, List.of(c.id(), a.id(), b.id()));

        assertEquals(3, result.updated());
        assertEquals(0, fixture.photos.findById(fixture.tenantId, c.id()).orElseThrow().sortOrder());
        assertEquals(1, fixture.photos.findById(fixture.tenantId, a.id()).orElseThrow().sortOrder());
        assertEquals(2, fixture.photos.findById(fixture.tenantId, b.id()).orElseThrow().sortOrder());
    }

    @Test
    void reorderAllowsPartialListAndKeepsOthers() {
        Fixture fixture = Fixture.create(MembershipRole.OWNER);
        Photo a = fixture.addPhoto("a");
        Photo b = fixture.addPhoto("b");
        Photo c = fixture.addPhoto("c");

        fixture.facade.reorder(fixture.galleryId, List.of(b.id()));

        assertEquals(0, fixture.photos.findById(fixture.tenantId, b.id()).orElseThrow().sortOrder());
        assertEquals(a.sortOrder(), fixture.photos.findById(fixture.tenantId, a.id()).orElseThrow().sortOrder());
        assertEquals(c.sortOrder(), fixture.photos.findById(fixture.tenantId, c.id()).orElseThrow().sortOrder());
    }

    @Test
    void reorderRejectsPhotoOutsideGallery() {
        Fixture fixture = Fixture.create(MembershipRole.OWNER);
        Photo inside = fixture.addPhoto("inside");
        Photo outside = fixture.addPhotoInGallery(UUID.randomUUID(), "outside");

        assertEquals("PHOTO_NOT_FOUND", assertThrows(DomainException.class,
                () -> fixture.facade.reorder(fixture.galleryId, List.of(inside.id(), outside.id()))).code());
    }

    @Test
    void reorderRequiresEditor() {
        Fixture fixture = Fixture.create(MembershipRole.VIEWER);

        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, assertThrows(DomainException.class,
                () -> fixture.facade.reorder(fixture.galleryId, List.of(UUID.randomUUID()))).code());
    }

    @Test
    void deleteAllOnlyDeletesPhotosInsideGallery() {
        Fixture fixture = Fixture.create(MembershipRole.OWNER);
        Photo inside = fixture.addPhoto("inside");
        Photo outside = fixture.addPhotoInGallery(UUID.randomUUID(), "outside");

        PhotoFacade.BatchDeleteResult result =
                fixture.facade.deleteAll(fixture.galleryId, List.of(inside.id(), outside.id(), UUID.randomUUID()));

        assertEquals(3, result.requested());
        assertEquals(1, result.deleted());
        assertEquals(PhotoStatus.DELETED, fixture.photos.values.get(inside.id()).status());
        assertEquals(PhotoStatus.READY, fixture.photos.values.get(outside.id()).status());
        assertEquals(2048L, fixture.quotas.releasedBytes);
        assertEquals(1L, fixture.quotas.releasedPhotos);
    }

    @Test
    void deleteAllRequiresEditor() {
        Fixture fixture = Fixture.create(MembershipRole.VIEWER);

        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, assertThrows(DomainException.class,
                () -> fixture.facade.deleteAll(fixture.galleryId, List.of(UUID.randomUUID()))).code());
    }

    private static final class Fixture {
        final UUID tenantId = UUID.randomUUID();
        final GalleryStore galleries = new GalleryStore();
        final FakePhotos photos = new FakePhotos();
        final FakeObjects objects = new FakeObjects();
        final FakeQuota quotas = new FakeQuota();
        final GalleryFacade galleryFacade;
        final PhotoFacade facade;
        final UUID galleryId;

        private Fixture(MembershipRole role) {
            galleryFacade = new GalleryFacade(galleries,
                    () -> new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER), photos);
            gallery = galleryFacade.create("Wedding", "wedding", GalleryVisibility.PRIVATE);
            galleryId = gallery.id();
            facade = new PhotoFacade(galleries, photos, objects, null, quotas, null,
                    () -> new TenantContext(UUID.randomUUID(), tenantId, role),
                    new WorkspaceAuthorizationPolicy(() -> new TenantContext(UUID.randomUUID(), tenantId, role)),
                    10_000, 10_000, 10_000, 10, 3);
        }

        static Fixture create(MembershipRole role) { return new Fixture(role); }

        Photo addPhoto(String name) { return addPhotoInGallery(galleryId, name); }

        Photo addPhotoInGallery(UUID targetGalleryId, String name) {
            UUID photoId = UUID.randomUUID();
            UUID objectId = UUID.randomUUID();
            photos.values.put(photoId, new Photo(photoId, tenantId, targetGalleryId, objectId, name,
                    0, false, PhotoStatus.READY, Instant.now()));
            objects.values.put(objectId, new cn.vie.vibe.gallery.domain.StorageObject(objectId, tenantId, "bucket",
                    "key-" + objectId, "thumb-" + objectId, "image/jpeg", 2048L, 100, 100, "sha",
                    cn.vie.vibe.gallery.domain.StorageObjectStatus.READY, Instant.now()));
            return photos.values.get(photoId);
        }

        private Gallery gallery;
    }

    private static final class GalleryStore implements GalleryRepository {
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
        public void updateCoverPhoto(UUID tenantId, UUID galleryId, UUID coverPhotoId) { }
        public int softDelete(UUID tenantId, UUID galleryId) {
            List<Gallery> removed = values.stream()
                    .filter(g -> g.tenantId().equals(tenantId) && g.id().equals(galleryId)).toList();
            values.removeAll(removed);
            return removed.size();
        }
    }

    private static final class FakePhotos implements PhotoRepository {
        final Map<UUID, Photo> values = new HashMap<>();
        public Photo save(Photo photo) { values.put(photo.id(), photo); return photo; }
        public List<Photo> findByGallery(UUID tenantId, UUID galleryId) {
            return values.values().stream()
                    .filter(p -> p.tenantId().equals(tenantId) && p.galleryId().equals(galleryId) && p.status() != PhotoStatus.DELETED)
                    .toList();
        }
        public Optional<Photo> findById(UUID tenantId, UUID photoId) {
            return Optional.ofNullable(values.get(photoId)).filter(p -> p.tenantId().equals(tenantId) && p.status() != PhotoStatus.DELETED);
        }
        public Optional<Photo> findById(UUID photoId) {
            return Optional.ofNullable(values.get(photoId)).filter(p -> p.status() != PhotoStatus.DELETED);
        }
        public int countByGalleryId(UUID galleryId) { return 0; }
        public List<Photo> findByGalleryIdWithPagination(UUID galleryId, int offset, int limit) { return List.of(); }
        public List<Photo> findPublicReadyByGalleryId(UUID tenantId, UUID galleryId, int offset, int limit) { return List.of(); }
        public int countPublicReadyByGalleryId(UUID tenantId, UUID galleryId) { return 0; }
        public int countFailedByGalleryId(UUID tenantId, UUID galleryId) { return 0; }
        public int updateStatus(UUID tenantId, UUID photoId, PhotoStatus status) {
            return findById(tenantId, photoId).map(p -> {
                values.put(photoId, new Photo(p.id(), p.tenantId(), p.galleryId(), p.storageObjectId(), p.title(),
                        p.sortOrder(), p.cover(), status, p.createdAt()));
                return 1;
            }).orElse(0);
        }
        public int updateMetadata(UUID tenantId, UUID photoId, String title, Integer sortOrder, Boolean cover) {
            return findById(tenantId, photoId).map(p -> {
                values.put(photoId, new Photo(p.id(), p.tenantId(), p.galleryId(), p.storageObjectId(),
                        title == null ? p.title() : title,
                        sortOrder == null ? p.sortOrder() : sortOrder,
                        cover == null ? p.cover() : cover,
                        p.status(), p.createdAt()));
                return 1;
            }).orElse(0);
        }
        public int clearCoverByGallery(UUID tenantId, UUID galleryId) { return 0; }
        public int softDelete(UUID tenantId, UUID photoId) { return updateStatus(tenantId, photoId, PhotoStatus.DELETED); }
    }

    private static final class FakeObjects implements StorageObjectRepository {
        final Map<UUID, cn.vie.vibe.gallery.domain.StorageObject> values = new HashMap<>();
        public cn.vie.vibe.gallery.domain.StorageObject save(cn.vie.vibe.gallery.domain.StorageObject object) {
            values.put(object.id(), object);
            return object;
        }
        public Optional<cn.vie.vibe.gallery.domain.StorageObject> findById(UUID tenantId, UUID objectId) {
            return Optional.ofNullable(values.get(objectId));
        }
        public int markReady(UUID tenantId, UUID objectId, String thumbnailKey, Integer width, Integer height) { return 0; }
        public int markFailed(UUID tenantId, UUID objectId) { return 0; }
        public int softDelete(UUID tenantId, UUID objectId) { return 0; }
    }

    private static final class FakeQuota implements TenantQuotaRepository {
        long releasedBytes;
        long releasedPhotos;
        public cn.vie.vibe.gallery.domain.TenantQuota findForUpdate(UUID tenantId) {
            return new cn.vie.vibe.gallery.domain.TenantQuota(tenantId, 1_000_000L, 0, 10_000, 0);
        }
        public void ensure(UUID tenantId, long maxBytes, long maxPhotos) { }
        public void reserve(UUID tenantId, long bytes, long photos) { }
        public void release(UUID tenantId, long bytes, long photos) {
            releasedBytes += bytes;
            releasedPhotos += photos;
        }
    }
}
