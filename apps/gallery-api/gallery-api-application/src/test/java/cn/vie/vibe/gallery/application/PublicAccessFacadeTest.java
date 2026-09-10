package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.GalleryStatus;
import cn.vie.vibe.gallery.domain.Photo;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import cn.vie.vibe.gallery.domain.PublicAccessException;
import cn.vie.vibe.gallery.domain.PublicAccessState;
import cn.vie.vibe.gallery.domain.ShareLink;
import cn.vie.vibe.gallery.domain.StorageObject;
import cn.vie.vibe.gallery.domain.StorageObjectStatus;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PublicAccessFacadeTest {
    private static final Instant CREATED_AT = Instant.parse("2026-01-01T00:00:00Z");

    @Test
    void resolvePublicGalleryIsReadyAndCountsOnlyReadyPhotos() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PUBLIC, null, "public-gallery");
        fixture.addPhoto(gallery, "ready", PhotoStatus.READY, StorageObjectStatus.READY, 1);
        fixture.addPhoto(gallery, "processing", PhotoStatus.PROCESSING, StorageObjectStatus.READY, 2);
        fixture.addPhoto(gallery, "failed", PhotoStatus.FAILED, StorageObjectStatus.READY, 3);
        fixture.addPhoto(gallery, "deleted", PhotoStatus.DELETED, StorageObjectStatus.READY, 4);

        PublicGalleryView result = fixture.facade.resolvePublicGallery(gallery.slug(), null);

        assertEquals(PublicAccessState.READY, result.accessState());
        assertEquals(GalleryVisibility.PUBLIC, result.visibility());
        assertEquals(1, result.photoCount());
    }

    @Test
    void unpublishedGalleryIsVisibleWithCreatorPreviewToken() {
        Fixture fixture = new Fixture();
        CreatorPreviewTokens previewTokens = new CreatorPreviewTokens(fixture.tokens);
        PublicAccessFacade facade = new PublicAccessFacade(
                fixture.galleries, fixture.shareLinks, fixture.photos, fixture.storage,
                new FixedObjectStorage(), new FixedPasswordHasher(), fixture.tokens, null, previewTokens);
        Gallery gallery = fixture.addGallery(GalleryVisibility.PUBLIC, null, "draft-preview");
        fixture.galleries.values.put(gallery.id(), new Gallery(gallery.id(), gallery.tenantId(), gallery.slug(), gallery.name(),
                gallery.visibility(), gallery.passwordHash(), gallery.coverPhotoId(), gallery.deleted(), gallery.createdAt(),
                GalleryStatus.DRAFT, null));
        fixture.addPhoto(gallery, "ready", PhotoStatus.READY, StorageObjectStatus.READY, 1);
        String token = previewTokens.issue(gallery.id()).token();

        PublicGalleryView result = facade.resolvePublicGallery(gallery.slug(), null, null, token);

        assertEquals(PublicAccessState.READY, result.accessState());
        assertEquals(1, result.photoCount());
        assertTrue(facade.allowsCreatorPreview(gallery.slug(), token));
        assertThrows(PublicAccessException.class,
                () -> fixture.facade.resolvePublicGallery(gallery.slug(), null));
    }

    @Test
    void unpublishedGalleryIsNotFoundForAllPublicCredentials() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PUBLIC, null, "draft-gallery");
        fixture.galleries.values.put(gallery.id(), new Gallery(gallery.id(), gallery.tenantId(), gallery.slug(), gallery.name(),
                gallery.visibility(), gallery.passwordHash(), gallery.coverPhotoId(), gallery.deleted(), gallery.createdAt(),
                GalleryStatus.DRAFT, null));

        PublicAccessException exception = assertThrows(PublicAccessException.class,
                () -> fixture.facade.resolvePublicGallery(gallery.slug(), null));
        assertEquals(PublicAccessException.GALLERY_NOT_FOUND, exception.getCode());
        assertThrows(PublicAccessException.class,
                () -> fixture.facade.listPublicPhotos(gallery.slug(), "anything", null, 0, 10));
    }

    @Test
    void archivedGalleryIsNotFound() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PUBLIC, null, "archived-gallery");
        fixture.galleries.values.put(gallery.id(), new Gallery(gallery.id(), gallery.tenantId(), gallery.slug(), gallery.name(),
                gallery.visibility(), gallery.passwordHash(), gallery.coverPhotoId(), gallery.deleted(), gallery.createdAt(),
                GalleryStatus.ARCHIVED, gallery.publishedAt()));

        PublicAccessException exception = assertThrows(PublicAccessException.class,
                () -> fixture.facade.resolvePublicGallery(gallery.slug(), null));
        assertEquals(PublicAccessException.GALLERY_NOT_FOUND, exception.getCode());
    }

    @Test
    void resolvePrivateGalleryRequiresAValidCurrentGalleryToken() {
        Fixture fixture = new Fixture();
        Gallery privateGallery = fixture.addGallery(GalleryVisibility.PRIVATE, null, "private-gallery");
        Gallery otherGallery = fixture.addGallery(GalleryVisibility.PRIVATE, null, "other-gallery");
        fixture.addLink(privateGallery, "valid-token", null, null);
        fixture.addLink(otherGallery, "other-token", null, null);

        assertEquals(PublicAccessState.SHARE_LINK_REQUIRED,
                fixture.facade.resolvePublicGallery(privateGallery.slug(), null).accessState());
        assertEquals(PublicAccessState.SHARE_LINK_REQUIRED,
                fixture.facade.resolvePublicGallery(privateGallery.slug(), "missing-token").accessState());
        assertEquals(PublicAccessState.READY,
                fixture.facade.resolvePublicGallery(privateGallery.slug(), "valid-token").accessState());
        assertEquals(PublicAccessState.SHARE_LINK_REQUIRED,
                fixture.facade.resolvePublicGallery(privateGallery.slug(), "other-token").accessState());
    }

    @Test
    void expiredAndRevokedTokensDoNotResolvePrivateGallery() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PRIVATE, null, "private-gallery");
        fixture.addLink(gallery, "expired-token", Instant.now().minusSeconds(60), null);
        fixture.addLink(gallery, "revoked-token", null, Instant.now().minusSeconds(60));

        assertEquals(PublicAccessState.SHARE_LINK_REQUIRED,
                fixture.facade.resolvePublicGallery(gallery.slug(), "expired-token").accessState());
        assertEquals(PublicAccessState.SHARE_LINK_REQUIRED,
                fixture.facade.resolvePublicGallery(gallery.slug(), "revoked-token").accessState());
    }

    @Test
    void validTokenTouchesLastAccessedButInvalidAndRevokedTokensDoNot() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PRIVATE, null, "private-gallery");
        fixture.addLink(gallery, "valid-token", null, null);
        fixture.addLink(gallery, "revoked-token", null, Instant.now().minusSeconds(60));

        fixture.facade.resolvePublicGallery(gallery.slug(), "missing-token");
        fixture.facade.resolvePublicGallery(gallery.slug(), "revoked-token");
        assertNull(fixture.shareLinks.findByTokenHash("hash:valid-token").orElseThrow().getLastAccessedAt());

        fixture.facade.resolvePublicGallery(gallery.slug(), "valid-token");
        assertNotNull(fixture.shareLinks.findByTokenHash("hash:valid-token").orElseThrow().getLastAccessedAt());
    }

    @Test
    void passwordGalleryRequiresPasswordAndUnlockReturnsRealGalleryId() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PASSWORD, "hash:correct", "password-gallery");
        fixture.addLink(gallery, "password-token", null, null);

        PublicGalleryView view = fixture.facade.resolvePublicGallery(gallery.slug(), null);
        UUID unlockedGalleryId = fixture.facade.unlockGallery(gallery.slug(), "password-token", "correct");

        assertEquals(PublicAccessState.PASSWORD_REQUIRED, view.accessState());
        assertEquals(PublicAccessState.READY,
                fixture.facade.resolvePublicGallery(gallery.slug(), null, gallery.id()).accessState());
        assertEquals(gallery.id(), unlockedGalleryId);
    }

    @Test
    void passwordUnlockRejectsWrongPasswordAndNonPasswordGallery() {
        Fixture fixture = new Fixture();
        Gallery passwordGallery = fixture.addGallery(GalleryVisibility.PASSWORD, "hash:correct", "password-gallery");
        Gallery publicGallery = fixture.addGallery(GalleryVisibility.PUBLIC, null, "public-gallery");
        fixture.addLink(passwordGallery, "password-token", null, null);

        PublicAccessException wrongPassword = assertThrows(PublicAccessException.class,
                () -> fixture.facade.unlockGallery(passwordGallery.slug(), "password-token", "wrong"));
        assertEquals(PublicAccessException.PASSWORD_INVALID, wrongPassword.getCode());

        DomainException nonPassword = assertThrows(DomainException.class,
                () -> fixture.facade.unlockGallery(publicGallery.slug(), null, "correct"));
        assertEquals("INVALID_OPERATION", nonPassword.code());
    }

    @Test
    void publicPhotosFilterPhotoStatusBeforeStablePaginationAndReturnFullTotal() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PUBLIC, null, "public-gallery");
        fixture.addPhoto(gallery, "first", PhotoStatus.READY, StorageObjectStatus.READY, 1);
        fixture.addPhoto(gallery, "processing", PhotoStatus.PROCESSING, StorageObjectStatus.READY, 2);
        fixture.addPhoto(gallery, "second", PhotoStatus.READY, StorageObjectStatus.READY, 3);
        fixture.addPhoto(gallery, "failed", PhotoStatus.FAILED, StorageObjectStatus.READY, 4);
        fixture.addPhoto(gallery, "third", PhotoStatus.READY, StorageObjectStatus.READY, 5);
        fixture.addPhoto(gallery, "deleted", PhotoStatus.DELETED, StorageObjectStatus.READY, 6);

        PublicPhotoPage firstPage = fixture.facade.listPublicPhotos(gallery.slug(), null, null, 0, 2);
        PublicPhotoPage secondPage = fixture.facade.listPublicPhotos(gallery.slug(), null, null, 1, 2);

        assertEquals(List.of("first", "second"), titles(firstPage));
        assertEquals(List.of("third"), titles(secondPage));
        assertEquals(3, firstPage.total());
        assertEquals(3, secondPage.total());
        assertEquals(0, firstPage.page());
        assertEquals(2, firstPage.pageSize());
    }

    @Test
    void publicPhotosRejectInvalidPageAndPageSize() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PUBLIC, null, "public-gallery");

        assertCode("INVALID_PAGE", () -> fixture.facade.listPublicPhotos(gallery.slug(), null, null, -1, 10));
        assertCode("INVALID_PAGE_SIZE", () -> fixture.facade.listPublicPhotos(gallery.slug(), null, null, 0, 0));
        assertCode("INVALID_PAGE_SIZE", () -> fixture.facade.listPublicPhotos(gallery.slug(), null, null, 0, 101));
        assertCode("INVALID_PAGE", () -> fixture.facade.listPublicPhotos(
                gallery.slug(), null, null, Integer.MAX_VALUE, 2));
    }

    @Test
    void emptyPublicGalleryReturnsEmptyPage() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PUBLIC, null, "empty-gallery");

        PublicPhotoPage result = fixture.facade.listPublicPhotos(gallery.slug(), null, null, 0, 20);

        assertTrue(result.items().isEmpty());
        assertEquals(0, result.total());
        assertEquals(0, result.page());
        assertEquals(20, result.pageSize());
    }

    @Test
    void privatePhotosRejectInvalidExpiredRevokedAndCrossGalleryTokens() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PRIVATE, null, "private-gallery");
        Gallery otherGallery = fixture.addGallery(GalleryVisibility.PRIVATE, null, "other-gallery");
        fixture.addLink(gallery, "valid-token", null, null);
        fixture.addLink(gallery, "expired-token", Instant.now().minusSeconds(60), null);
        fixture.addLink(gallery, "revoked-token", null, Instant.now().minusSeconds(60));
        fixture.addLink(otherGallery, "cross-gallery-token", null, null);

        PublicPhotoPage valid = fixture.facade.listPublicPhotos(gallery.slug(), "valid-token", null, 0, 10);
        assertEquals(0, valid.total());
        assertCode(PublicAccessException.SHARE_LINK_REQUIRED,
                () -> fixture.facade.listPublicPhotos(gallery.slug(), null, null, 0, 10));
        assertCode(PublicAccessException.SHARE_LINK_INVALID,
                () -> fixture.facade.listPublicPhotos(gallery.slug(), "missing-token", null, 0, 10));
        assertCode(PublicAccessException.SHARE_LINK_EXPIRED,
                () -> fixture.facade.listPublicPhotos(gallery.slug(), "expired-token", null, 0, 10));
        assertCode(PublicAccessException.SHARE_LINK_REVOKED,
                () -> fixture.facade.listPublicPhotos(gallery.slug(), "revoked-token", null, 0, 10));
        assertCode(PublicAccessException.SHARE_LINK_INVALID,
                () -> fixture.facade.listPublicPhotos(gallery.slug(), "cross-gallery-token", null, 0, 10));
    }

    @Test
    void passwordPhotosRequireMatchingGallerySession() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PASSWORD, "hash:correct", "password-gallery");
        fixture.addPhoto(gallery, "private-photo", PhotoStatus.READY, StorageObjectStatus.READY, 1);

        assertCode(PublicAccessException.PUBLIC_SESSION_EXPIRED,
                () -> fixture.facade.listPublicPhotos(gallery.slug(), null, null, 0, 10));
        assertCode(PublicAccessException.PUBLIC_SESSION_EXPIRED,
                () -> fixture.facade.listPublicPhotos(gallery.slug(), null, UUID.randomUUID(), 0, 10));

        PublicPhotoPage result = fixture.facade.listPublicPhotos(gallery.slug(), null, gallery.id(), 0, 10);
        assertEquals(List.of("private-photo"), titles(result));
    }

    @Test
    void photoWithNonReadyStorageObjectIsNotPublic() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PUBLIC, null, "public-gallery");
        fixture.addPhoto(gallery, "uploading-object", PhotoStatus.READY, StorageObjectStatus.UPLOADING, 1);
        fixture.addPhoto(gallery, "failed-object", PhotoStatus.READY, StorageObjectStatus.FAILED, 2);
        fixture.addPhoto(gallery, "deleted-object", PhotoStatus.READY, StorageObjectStatus.DELETED, 3);

        PublicPhotoPage result = fixture.facade.listPublicPhotos(gallery.slug(), null, null, 0, 10);

        assertTrue(result.items().isEmpty());
    }

    @Test
    void publicPhotoUsesThumbnailUrlAndSafeDimensions() {
        Fixture fixture = new Fixture();
        Gallery gallery = fixture.addGallery(GalleryVisibility.PUBLIC, null, "public-gallery");
        UUID objectId = UUID.randomUUID();
        fixture.storageObjects.put(objectId, new StorageObject(
                objectId, fixture.tenantId, "bucket", "original/key.jpg", "thumb/key.jpg",
                "image/jpeg", 100, null, 720, "sha", StorageObjectStatus.READY, CREATED_AT));
        fixture.photos.values.put(UUID.randomUUID(), new Photo(
                UUID.randomUUID(), fixture.tenantId, gallery.id(), objectId, "photo", 1, false,
                PhotoStatus.READY, CREATED_AT));

        PublicPhotoPage result = fixture.facade.listPublicPhotos(gallery.slug(), null, null, 0, 10);

        assertEquals(1, result.items().size());
        assertEquals("https://cdn.test/thumb/key.jpg", result.items().get(0).thumbnailUrl());
        assertEquals(0, result.items().get(0).width());
        assertEquals(720, result.items().get(0).height());
    }

    private static List<String> titles(PublicPhotoPage page) {
        return page.items().stream().map(PublicPhotoView::title).toList();
    }

    private static void assertCode(String code, Runnable action) {
        RuntimeException exception = assertThrows(RuntimeException.class, action::run);
        if (exception instanceof DomainException domainException) {
            assertEquals(code, domainException.code());
        } else if (exception instanceof PublicAccessException publicAccessException) {
            assertEquals(code, publicAccessException.getCode());
        } else {
            throw exception;
        }
    }

    private static final class Fixture {
        final UUID tenantId = UUID.randomUUID();
        final GalleryStore galleries = new GalleryStore();
        final ShareLinkStore shareLinks = new ShareLinkStore();
        final PhotoStore photos = new PhotoStore();
        final StorageStore storage = new StorageStore();
        final Map<UUID, StorageObject> storageObjects = storage.values;
        final TokenGenerator tokens = new FixedTokenGenerator();
        final PublicAccessFacade facade = new PublicAccessFacade(
                galleries, shareLinks, photos, storage, new FixedObjectStorage(),
                new FixedPasswordHasher(), tokens);

        Gallery addGallery(GalleryVisibility visibility, String passwordHash, String slug) {
            Gallery gallery = new Gallery(UUID.randomUUID(), tenantId, slug, slug + " title", visibility,
                    passwordHash, null, false, CREATED_AT);
            galleries.values.put(gallery.id(), gallery);
            return gallery;
        }

        void addPhoto(Gallery gallery, String title, PhotoStatus photoStatus,
                      StorageObjectStatus objectStatus, int sortOrder) {
            UUID objectId = UUID.randomUUID();
            storage.values.put(objectId, new StorageObject(
                    objectId, tenantId, "bucket", "object/" + title, "thumb/" + title,
                    "image/jpeg", 100, 1200, 800, "sha-" + title, objectStatus, CREATED_AT));
            UUID photoId = UUID.randomUUID();
            photos.values.put(photoId, new Photo(photoId, tenantId, gallery.id(), objectId, title,
                    sortOrder, false, photoStatus, CREATED_AT));
        }

        void addLink(Gallery gallery, String rawToken, Instant expiresAt, Instant revokedAt) {
            Instant now = CREATED_AT;
            UUID linkId = UUID.randomUUID();
            shareLinks.values.put(linkId, new ShareLink(linkId, gallery.id(), tokens.hashToken(rawToken),
                    expiresAt, revokedAt, null, now, now));
        }
    }

    private static final class GalleryStore implements GalleryRepository {
        final Map<UUID, Gallery> values = new HashMap<>();

        public List<Gallery> findAll(UUID tenantId) {
            return values.values().stream().filter(g -> g.tenantId().equals(tenantId)).toList();
        }

        public Optional<Gallery> findByTenantAndSlug(UUID tenantId, String slug) {
            return values.values().stream().filter(g -> g.tenantId().equals(tenantId) && g.slug().equals(slug)).findFirst();
        }

        public Optional<Gallery> findBySlug(String slug) {
            return values.values().stream().filter(g -> g.slug().equals(slug)).findFirst();
        }

        public Optional<Gallery> findById(UUID galleryId) {
            return Optional.ofNullable(values.get(galleryId));
        }

        public Optional<Gallery> findById(UUID tenantId, UUID galleryId) {
            return Optional.ofNullable(values.get(galleryId)).filter(g -> g.tenantId().equals(tenantId));
        }

        public Gallery save(Gallery gallery) {
            values.put(gallery.id(), gallery);
            return gallery;
        }

        public void update(Gallery gallery) {
            values.put(gallery.id(), gallery);
        }

        public void updateCoverPhoto(UUID tenantId, UUID galleryId, UUID coverPhotoId) {
            Gallery gallery = values.get(galleryId);
            if (gallery != null && gallery.tenantId().equals(tenantId)) {
                values.put(galleryId, new Gallery(gallery.id(), gallery.tenantId(), gallery.slug(), gallery.name(),
                        gallery.visibility(), gallery.passwordHash(), coverPhotoId, gallery.deleted(), gallery.createdAt()));
            }
        }
    }

    private static final class ShareLinkStore implements ShareLinkRepository {
        final Map<UUID, ShareLink> values = new HashMap<>();

        public void save(ShareLink shareLink) {
            values.put(shareLink.getId(), shareLink);
        }

        public Optional<ShareLink> findById(UUID id) {
            return Optional.ofNullable(values.get(id));
        }

        public Optional<ShareLink> findByTokenHash(String tokenHash) {
            return values.values().stream().filter(link -> link.getTokenHash().equals(tokenHash)).findFirst();
        }

        public List<ShareLink> findByGalleryId(UUID galleryId) {
            return values.values().stream().filter(link -> link.getGalleryId().equals(galleryId)).toList();
        }

        public List<ShareLink> findByGalleryIdAndTenantId(UUID galleryId, UUID tenantId) {
            return findByGalleryId(galleryId);
        }

        public void update(ShareLink shareLink) {
            values.put(shareLink.getId(), shareLink);
        }

        public void touchLastAccessed(UUID id, Instant lastAccessedAt, Instant threshold) {
            ShareLink link = values.get(id);
            if (link == null) return;
            if (link.getLastAccessedAt() == null || link.getLastAccessedAt().isBefore(threshold)) {
                values.put(id, new ShareLink(link.getId(), link.getGalleryId(), link.getTokenHash(),
                        link.getExpiresAt(), link.getRevokedAt(), lastAccessedAt, link.getCreatedAt(), lastAccessedAt));
            }
        }

        public void delete(UUID id) {
            values.remove(id);
        }
    }

    private static final class PhotoStore implements PhotoRepository {
        final Map<UUID, Photo> values = new HashMap<>();

        public Photo save(Photo photo) {
            values.put(photo.id(), photo);
            return photo;
        }

        public List<Photo> findByGallery(UUID tenantId, UUID galleryId) {
            return values.values().stream().filter(photo -> photo.tenantId().equals(tenantId)
                    && photo.galleryId().equals(galleryId) && photo.status() != PhotoStatus.DELETED).toList();
        }

        public Optional<Photo> findById(UUID tenantId, UUID photoId) {
            return Optional.ofNullable(values.get(photoId)).filter(photo -> photo.tenantId().equals(tenantId))
                    .filter(photo -> photo.status() != PhotoStatus.DELETED);
        }

        public Optional<Photo> findById(UUID photoId) {
            return Optional.ofNullable(values.get(photoId)).filter(photo -> photo.status() != PhotoStatus.DELETED);
        }

        public int countByGalleryId(UUID galleryId) {
            return (int) values.values().stream().filter(photo -> photo.galleryId().equals(galleryId)
                    && photo.status() != PhotoStatus.DELETED).count();
        }

        public List<Photo> findByGalleryIdWithPagination(UUID galleryId, int offset, int limit) {
            return sorted(values.values().stream().filter(photo -> photo.galleryId().equals(galleryId)
                    && photo.status() != PhotoStatus.DELETED).toList(), offset, limit);
        }

        public List<Photo> findPublicReadyByGalleryId(UUID tenantId, UUID galleryId, int offset, int limit) {
            List<Photo> ready = sorted(values.values().stream().filter(photo -> photo.tenantId().equals(tenantId)
                    && photo.galleryId().equals(galleryId) && photo.status() == PhotoStatus.READY).toList(), offset, limit);
            return ready;
        }

        public int countPublicReadyByGalleryId(UUID tenantId, UUID galleryId) {
            return (int) values.values().stream().filter(photo -> photo.tenantId().equals(tenantId)
                    && photo.galleryId().equals(galleryId) && photo.status() == PhotoStatus.READY).count();
        }

        public int countFailedByGalleryId(UUID tenantId, UUID galleryId) {
            return (int) values.values().stream().filter(photo -> photo.tenantId().equals(tenantId)
                    && photo.galleryId().equals(galleryId) && photo.status() == PhotoStatus.FAILED).count();
        }

        public int updateStatus(UUID tenantId, UUID photoId, PhotoStatus status) {
            Photo photo = values.get(photoId);
            if (photo == null || !photo.tenantId().equals(tenantId)) return 0;
            values.put(photoId, new Photo(photo.id(), photo.tenantId(), photo.galleryId(), photo.storageObjectId(),
                    photo.title(), photo.sortOrder(), photo.cover(), status, photo.createdAt()));
            return 1;
        }

        public int updateMetadata(UUID tenantId, UUID photoId, String title, Integer sortOrder, Boolean cover) {
            return 0;
        }

        public int clearCoverByGallery(UUID tenantId, UUID galleryId) {
            return 0;
        }

        public int softDelete(UUID tenantId, UUID photoId) {
            return updateStatus(tenantId, photoId, PhotoStatus.DELETED);
        }

        private static List<Photo> sorted(List<Photo> photos, int offset, int limit) {
            List<Photo> sorted = new ArrayList<>(photos);
            sorted.sort(Comparator.comparingInt(Photo::sortOrder).thenComparing(Photo::createdAt).thenComparing(Photo::id));
            if (offset >= sorted.size()) return List.of();
            return sorted.subList(offset, Math.min(sorted.size(), offset + limit));
        }
    }

    private static final class StorageStore implements StorageObjectRepository {
        final Map<UUID, StorageObject> values = new HashMap<>();

        public StorageObject save(StorageObject object) {
            values.put(object.id(), object);
            return object;
        }

        public Optional<StorageObject> findById(UUID tenantId, UUID objectId) {
            return Optional.ofNullable(values.get(objectId)).filter(object -> object.tenantId().equals(tenantId));
        }

        public int markReady(UUID tenantId, UUID objectId, String thumbnailKey, Integer width, Integer height) {
            return 0;
        }

        public int markFailed(UUID tenantId, UUID objectId) {
            return 0;
        }

        public int softDelete(UUID tenantId, UUID objectId) {
            return 0;
        }
    }

    private static final class FixedObjectStorage implements ObjectStoragePort {
        public StoredObject put(String key, InputStream content, String contentType, long size) {
            return new StoredObject("bucket", key, null, size, null, null, "sha");
        }

        public InputStream get(String key) {
            return InputStream.nullInputStream();
        }

        public void delete(String key) {
        }

        public URI createReadUrl(String key, Duration ttl) {
            assertEquals(ObjectStoragePort.DEFAULT_READ_URL_TTL, ttl);
            return URI.create("https://cdn.test/" + key);
        }
    }

    private static final class FixedPasswordHasher implements PasswordHasher {
        public String hash(String rawPassword) {
            return "hash:" + rawPassword;
        }

        public boolean matches(String rawPassword, String passwordHash) {
            return passwordHash != null && passwordHash.equals(hash(rawPassword));
        }
    }

    private static final class FixedTokenGenerator implements TokenGenerator {
        public String generateToken() {
            return "generated-token";
        }

        public String hashToken(String rawToken) {
            return "hash:" + rawToken;
        }

        public boolean verifyToken(String rawToken, String tokenHash) {
            return hashToken(rawToken).equals(tokenHash);
        }
    }
}
