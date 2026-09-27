package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.Photo;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import cn.vie.vibe.gallery.domain.StorageObject;
import cn.vie.vibe.gallery.domain.StorageObjectStatus;
import cn.vie.vibe.gallery.domain.TenantContext;
import cn.vie.vibe.gallery.domain.TenantQuota;
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

class GalleryFacadeDeletionTest {

    @Test
    void nonOwnerCannotDeleteGallery() {
        UUID tenantId = UUID.randomUUID();
        Fixture fixture = Fixture.create(tenantId);
        GalleryFacade editorFacade = fixture.facadeFor(MembershipRole.EDITOR);

        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE,
                assertThrows(DomainException.class, () -> editorFacade.delete(fixture.gallery.id())).code());
    }

    @Test
    void deleteRejectsPublishedGallery() {
        UUID tenantId = UUID.randomUUID();
        Fixture fixture = Fixture.create(tenantId);
        fixture.photos.ready = 1;
        fixture.facade.publish(fixture.gallery.id());

        assertEquals("GALLERY_STATE_CONFLICT",
                assertThrows(DomainException.class, () -> fixture.facade.delete(fixture.gallery.id())).code());
        assertTrue(fixture.galleries.findById(tenantId, fixture.gallery.id()).isPresent());
    }

    @Test
    void deleteSoftDeletesGalleryPhotosAndReleasesQuota() {
        UUID tenantId = UUID.randomUUID();
        Fixture fixture = Fixture.create(tenantId);
        UUID otherGalleryId = UUID.randomUUID();
        Photo targetA = fixture.addPhoto(fixture.gallery.id(), 1024L);
        Photo targetB = fixture.addPhoto(fixture.gallery.id(), 2048L);
        Photo elsewhere = fixture.addPhoto(otherGalleryId, 4096L);

        fixture.facade.delete(fixture.gallery.id());

        assertTrue(fixture.galleries.findById(tenantId, fixture.gallery.id()).isEmpty());
        assertEquals(PhotoStatus.DELETED, fixture.photos.values.get(targetA.id()).status());
        assertEquals(PhotoStatus.DELETED, fixture.photos.values.get(targetB.id()).status());
        assertEquals(PhotoStatus.READY, fixture.photos.values.get(elsewhere.id()).status());
        assertEquals(StorageObjectStatus.DELETED, fixture.objects.values.get(targetA.storageObjectId()).status());
        assertEquals(StorageObjectStatus.DELETED, fixture.objects.values.get(targetB.storageObjectId()).status());
        assertEquals(StorageObjectStatus.READY, fixture.objects.values.get(elsewhere.storageObjectId()).status());
        assertEquals(3072L, fixture.quotas.releasedBytes);
        assertEquals(2L, fixture.quotas.releasedPhotos);
    }

    @Test
    void deleteMissingGalleryIsNotFound() {
        UUID tenantId = UUID.randomUUID();
        Fixture fixture = Fixture.create(tenantId);

        assertEquals("GALLERY_NOT_FOUND",
                assertThrows(DomainException.class, () -> fixture.facade.delete(UUID.randomUUID())).code());
    }

    private static final class Fixture {
        final GalleryFacade facade;
        final Gallery gallery;
        final GalleryStore galleries;
        final FakePhotos photos;
        final FakeObjects objects;
        final FakeQuota quotas;

        private Fixture(GalleryFacade facade, Gallery gallery, GalleryStore galleries,
                        FakePhotos photos, FakeObjects objects, FakeQuota quotas) {
            this.facade = facade;
            this.gallery = gallery;
            this.galleries = galleries;
            this.photos = photos;
            this.objects = objects;
            this.quotas = quotas;
        }

        static Fixture create(UUID tenantId) {
            GalleryStore galleries = new GalleryStore();
            FakePhotos photos = new FakePhotos();
            FakeObjects objects = new FakeObjects();
            FakeQuota quotas = new FakeQuota();
            GalleryFacade facade = facadeFor(tenantId, MembershipRole.OWNER, galleries, photos, objects, quotas);
            Gallery gallery = facade.create("Wedding", "wedding", GalleryVisibility.PRIVATE);
            return new Fixture(facade, gallery, galleries, photos, objects, quotas);
        }

        GalleryFacade facadeFor(MembershipRole role) {
            return facadeFor(gallery.tenantId(), role, galleries, photos, objects, quotas);
        }

        private static GalleryFacade facadeFor(UUID tenantId, MembershipRole role, GalleryStore galleries,
                                               FakePhotos photos, FakeObjects objects, FakeQuota quotas) {
            return new GalleryFacade(galleries,
                    () -> new TenantContext(UUID.randomUUID(), tenantId, role),
                    photos, new WorkspaceAuthorizationPolicy(() -> new TenantContext(UUID.randomUUID(), tenantId, role)),
                    null, objects, quotas);
        }

        Photo addPhoto(UUID galleryId, long byteSize) {
            UUID tenantId = gallery.tenantId();
            UUID photoId = UUID.randomUUID();
            UUID objectId = UUID.randomUUID();
            photos.values.put(photoId, new Photo(photoId, tenantId, galleryId, objectId, "photo-" + photoId,
                    0, false, PhotoStatus.READY, Instant.now()));
            objects.values.put(objectId, new StorageObject(objectId, tenantId, "bucket", "key-" + objectId,
                    "thumb-" + objectId, "image/jpeg", byteSize, 100, 100, "sha", StorageObjectStatus.READY, Instant.now()));
            return photos.values.get(photoId);
        }
    }

    private static final class GalleryStore implements GalleryRepository {
        final List<Gallery> values = new ArrayList<>();
        public List<Gallery> findAll(UUID tenantId) {
            return values.stream().filter(g -> g.tenantId().equals(tenantId) && !g.deleted()).toList();
        }
        public Optional<Gallery> findByTenantAndSlug(UUID tenantId, String slug) {
            return values.stream().filter(g -> g.tenantId().equals(tenantId) && g.slug().equals(slug) && !g.deleted()).findFirst();
        }
        public Optional<Gallery> findBySlug(String slug) {
            return values.stream().filter(g -> g.slug().equals(slug) && !g.deleted()).findFirst();
        }
        public Optional<Gallery> findById(UUID galleryId) {
            return values.stream().filter(g -> g.id().equals(galleryId) && !g.deleted()).findFirst();
        }
        public Optional<Gallery> findById(UUID tenantId, UUID galleryId) {
            return values.stream().filter(g -> g.tenantId().equals(tenantId) && g.id().equals(galleryId) && !g.deleted()).findFirst();
        }
        public Gallery save(Gallery gallery) { values.add(gallery); return gallery; }
        public void update(Gallery gallery) {
            values.removeIf(g -> g.id().equals(gallery.id()));
            values.add(gallery);
        }
        public void updateCoverPhoto(UUID tenantId, UUID galleryId, UUID coverPhotoId) {
            findById(tenantId, galleryId).ifPresent(g -> {
                values.remove(g);
                values.add(new Gallery(g.id(), g.tenantId(), g.slug(), g.name(), g.visibility(), g.passwordHash(),
                        coverPhotoId, g.deleted(), g.createdAt(), g.status(), g.publishedAt(), g.updatedAt()));
            });
        }
        public int softDelete(UUID tenantId, UUID galleryId) {
            List<Gallery> removed = values.stream()
                    .filter(g -> g.tenantId().equals(tenantId) && g.id().equals(galleryId)).toList();
            values.removeAll(removed);
            return removed.size();
        }
    }

    private static final class FakePhotos implements PhotoRepository {
        final Map<UUID, Photo> values = new HashMap<>();
        int ready;
        public Photo save(Photo photo) { values.put(photo.id(), photo); return photo; }
        public List<Photo> findByGallery(UUID tenantId, UUID galleryId) {
            return values.values().stream()
                    .filter(p -> p.tenantId().equals(tenantId) && p.galleryId().equals(galleryId) && p.status() != PhotoStatus.DELETED)
                    .sorted(java.util.Comparator.comparingInt(Photo::sortOrder)).toList();
        }
        public Optional<Photo> findById(UUID tenantId, UUID photoId) {
            return Optional.ofNullable(values.get(photoId)).filter(p -> p.tenantId().equals(tenantId) && p.status() != PhotoStatus.DELETED);
        }
        public Optional<Photo> findById(UUID photoId) {
            return Optional.ofNullable(values.get(photoId)).filter(p -> p.status() != PhotoStatus.DELETED);
        }
        public int countByGalleryId(UUID galleryId) { return ready; }
        public List<Photo> findByGalleryIdWithPagination(UUID galleryId, int offset, int limit) { return List.of(); }
        public List<Photo> findPublicReadyByGalleryId(UUID tenantId, UUID galleryId, int offset, int limit) { return List.of(); }
        public int countPublicReadyByGalleryId(UUID tenantId, UUID galleryId) { return ready; }
        public int countFailedByGalleryId(UUID tenantId, UUID galleryId) { return 0; }
        public int updateStatus(UUID tenantId, UUID photoId, PhotoStatus status) {
            return findById(tenantId, photoId).map(p -> {
                values.put(photoId, new Photo(p.id(), p.tenantId(), p.galleryId(), p.storageObjectId(), p.title(),
                        p.sortOrder(), p.cover(), status, p.createdAt()));
                return 1;
            }).orElse(0);
        }
        public int updateMetadata(UUID tenantId, UUID photoId, String title, Integer sortOrder, Boolean cover) { return 0; }
        public int clearCoverByGallery(UUID tenantId, UUID galleryId) { return 0; }
        public int softDelete(UUID tenantId, UUID photoId) { return updateStatus(tenantId, photoId, PhotoStatus.DELETED); }
    }

    private static final class FakeObjects implements StorageObjectRepository {
        final Map<UUID, StorageObject> values = new HashMap<>();
        public StorageObject save(StorageObject object) { values.put(object.id(), object); return object; }
        public Optional<StorageObject> findById(UUID tenantId, UUID objectId) {
            return Optional.ofNullable(values.get(objectId))
                    .filter(o -> o.tenantId().equals(tenantId) && o.status() != StorageObjectStatus.DELETED);
        }
        public int markReady(UUID tenantId, UUID objectId, String thumbnailKey, Integer width, Integer height) { return 0; }
        public int markFailed(UUID tenantId, UUID objectId) { return 0; }
        public int softDelete(UUID tenantId, UUID objectId) {
            return Optional.ofNullable(values.get(objectId))
                    .filter(o -> o.tenantId().equals(tenantId))
                    .map(o -> {
                        values.put(objectId, new StorageObject(o.id(), o.tenantId(), o.bucket(), o.objectKey(), o.thumbnailKey(),
                                o.mimeType(), o.byteSize(), o.width(), o.height(), o.sha256(),
                                StorageObjectStatus.DELETED, o.createdAt()));
                        return 1;
                    }).orElse(0);
        }
    }

    private static final class FakeQuota implements TenantQuotaRepository {
        long releasedBytes;
        long releasedPhotos;
        private TenantQuota quota = new TenantQuota(UUID.randomUUID(), 1_000_000L, 0, 10_000, 0);
        public TenantQuota findForUpdate(UUID tenantId) { return quota; }
        public void ensure(UUID tenantId, long maxBytes, long maxPhotos) { }
        public void reserve(UUID tenantId, long bytes, long photos) { }
        public void release(UUID tenantId, long bytes, long photos) {
            releasedBytes += bytes;
            releasedPhotos += photos;
            quota = new TenantQuota(quota.tenantId(), quota.maxBytes(),
                    Math.max(0, quota.usedBytes() - bytes), quota.maxPhotos(), Math.max(0, quota.photoCount() - photos));
        }
    }
}
