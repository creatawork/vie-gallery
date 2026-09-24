package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.GalleryStatus;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.Photo;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import cn.vie.vibe.gallery.domain.ShareLink;
import cn.vie.vibe.gallery.domain.ShareLinkStatus;
import cn.vie.vibe.gallery.domain.StorageObject;
import cn.vie.vibe.gallery.domain.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ShareLinkFacadeTest {
    private static final Instant CREATED_AT = Instant.parse("2026-01-01T00:00:00Z");

    @AfterEach
    void clearTenantContext() {
        TenantContextHolder.clear();
    }

    @Test
    void editorCannotManageShareLinks() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "editor-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.EDITOR));

        assertCode(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, () -> fixture.facade.listShareLinks(gallery.id().toString()));
        assertCode(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, () -> fixture.facade.createShareLink(
                new CreateShareLinkCommand(gallery.id().toString(), null)));
    }

    @Test
    void createShareLinkUsesQueryTokenUrlAndStoresOnlyTokenHash() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "summer-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));

        Instant expiresAt = Instant.now().plusSeconds(3600);
        CreateShareLinkResult result = fixture.facade.createShareLink(
                new CreateShareLinkCommand(gallery.id().toString(), expiresAt));

        assertEquals("https://viewer.test/g/summer-gallery?t=raw-token", result.shareUrl());
        assertFalse(result.shareUrl().contains("#"));
        assertEquals("raw-token", result.rawToken());
        assertEquals(1, fixture.links.values.size());
        ShareLink saved = fixture.links.values.values().iterator().next();
        assertEquals(fixture.tokens.hashToken("raw-token"), saved.getTokenHash());
        assertFalse(saved.getTokenHash().contains("raw-token"));
    }

    @Test
    void draftGalleryCannotCreateShareLink() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = new Gallery(UUID.randomUUID(), tenantId, "draft", "draft", GalleryVisibility.PRIVATE,
                null, null, false, CREATED_AT, GalleryStatus.DRAFT, null);
        Fixture fixture = new Fixture(tenantId, gallery);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));

        DomainException exception = assertThrows(DomainException.class, () -> fixture.facade.createShareLink(
                new CreateShareLinkCommand(gallery.id().toString(), Instant.now().plusSeconds(3600))));
        assertEquals("GALLERY_NOT_FOUND", exception.code());
    }

    @Test
    void listShareLinksReturnsStatusesWithoutRawToken() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "status-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));
        ShareLink active = fixture.addLink(gallery, "active-token", null, null);
        ShareLink expired = fixture.addLink(gallery, "expired-token", Instant.now().minusSeconds(60), null);
        ShareLink revoked = fixture.addLink(gallery, "revoked-token", null, Instant.now().minusSeconds(60));

        List<ShareLinkView> result = fixture.facade.listShareLinks(gallery.id().toString());

        assertEquals(3, result.size());
        assertEquals(ShareLinkStatus.ACTIVE, viewFor(result, active.getId()).status());
        assertEquals(ShareLinkStatus.EXPIRED, viewFor(result, expired.getId()).status());
        assertEquals(ShareLinkStatus.REVOKED, viewFor(result, revoked.getId()).status());
        assertFalse(result.toString().contains("active-token"));
        assertFalse(result.toString().contains("expired-token"));
        assertFalse(result.toString().contains("revoked-token"));
    }

    @Test
    void revokeShareLinkChangesStatusAndDeleteRemovesLink() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "managed-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));
        ShareLink link = fixture.addLink(gallery, "raw-token", null, null);

        fixture.facade.revokeShareLink(link.getId().toString());
        ShareLinkView revoked = viewFor(fixture.facade.listShareLinks(gallery.id().toString()), link.getId());
        assertEquals(ShareLinkStatus.REVOKED, revoked.status());
        assertNotNull(fixture.links.findById(link.getId()).orElseThrow().getRevokedAt());

        fixture.facade.deleteShareLink(link.getId().toString());
        assertTrue(fixture.links.findById(link.getId()).isEmpty());
        assertTrue(fixture.facade.listShareLinks(gallery.id().toString()).isEmpty());
    }

    @Test
    void anotherTenantCannotCreateListRevokeOrDeleteLinks() {
        UUID ownerTenantId = UUID.randomUUID();
        UUID otherTenantId = UUID.randomUUID();
        Gallery gallery = gallery(ownerTenantId, "tenant-gallery");
        Fixture fixture = new Fixture(ownerTenantId, gallery);
        ShareLink link = fixture.addLink(gallery, "raw-token", null, null);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), otherTenantId, MembershipRole.OWNER));

        assertCode("GALLERY_NOT_FOUND", () -> fixture.facade.createShareLink(
                new CreateShareLinkCommand(gallery.id().toString(), Instant.now().plusSeconds(3600))));
        assertCode("GALLERY_NOT_FOUND", () -> fixture.facade.listShareLinks(gallery.id().toString()));
        assertCode("SHARE_LINK_NOT_FOUND", () -> fixture.facade.revokeShareLink(link.getId().toString()));
        assertCode("SHARE_LINK_NOT_FOUND", () -> fixture.facade.deleteShareLink(link.getId().toString()));
    }

    @Test
    void missingGalleryAndMissingLinkUseStableErrors() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "existing-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));

        assertCode("GALLERY_NOT_FOUND", () -> fixture.facade.listShareLinks(UUID.randomUUID().toString()));
        assertCode("SHARE_LINK_NOT_FOUND", () -> fixture.facade.revokeShareLink(UUID.randomUUID().toString()));
        assertCode("SHARE_LINK_NOT_FOUND", () -> fixture.facade.deleteShareLink(UUID.randomUUID().toString()));
    }

    @Test
    void generateShortLinkCreatesShortCodeAndReturnsShortUrl() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "summer-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));

        ShareLink link = fixture.addLink(gallery, "raw-token", Instant.now().plusSeconds(3600), null);
        CreateShortUrlResult result = fixture.facade.generateShortLink(link.getId().toString());

        assertNotNull(result.shortCode());
        assertEquals(6, result.shortCode().length());
        assertTrue(result.shortUrl().matches("https://viewer\\.test/s/[A-Za-z0-9]{6}"));
        
        // 验证短码已存储
        ShareLink updated = fixture.links.findById(link.getId()).orElseThrow();
        assertEquals(result.shortCode(), updated.getShortCode());
    }

    @Test
    void generateQrCodeReturnsShortUrlAndPngBytes() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "summer-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));

        ShareLink link = fixture.addLink(gallery, "raw-token", Instant.now().plusSeconds(3600), null);
        fixture.links.assignShortCode(link.getId(), "fixed1", Instant.now());

        GenerateShareLinkQrResult result = fixture.facade.generateQrCode(link.getId().toString());

        assertEquals("https://viewer.test/s/fixed1", result.shareUrl());
        assertNotNull(result.pngBytes());
        assertTrue(result.pngBytes().length > 0);
        // PNG 文件签名
        assertEquals(0x89, result.pngBytes()[0] & 0xFF);
        assertEquals(0x50, result.pngBytes()[1] & 0xFF);
        assertEquals(0x4E, result.pngBytes()[2] & 0xFF);
        assertEquals(0x47, result.pngBytes()[3] & 0xFF);
    }

    @Test
    void editorCannotGenerateShareLinkQrCode() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "editor-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.EDITOR));

        ShareLink link = fixture.addLink(gallery, "raw-token", Instant.now().plusSeconds(3600), null);

        assertCode(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE,
                () -> fixture.facade.generateQrCode(link.getId().toString()));
    }

    @Test
    void resolveShortLinkReturnsFullUrlWithToken() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "summer-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);

        ShareLink link = fixture.addLink(gallery, "raw-token", Instant.now().plusSeconds(3600), null);
        fixture.links.assignShortCode(link.getId(), "abc123", Instant.now());

        ShortLinkTarget target = fixture.facade.resolveShortLink("abc123");

        assertEquals("https://viewer.test/g/summer-gallery?t=raw-token", target.fullUrl());
    }

    @Test
    void resolveShortLinkFailsForExpiredLink() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "expired-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);

        ShareLink link = fixture.addLink(gallery, "raw-token", Instant.now().minusSeconds(3600), null);
        fixture.links.assignShortCode(link.getId(), "exp123", Instant.now());

        assertCode("SHORT_LINK_INVALID", () -> fixture.facade.resolveShortLink("exp123"));
    }

    @Test
    void resolveShortLinkFailsForRevokedLink() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "revoked-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);

        ShareLink link = fixture.addLink(gallery, "raw-token", Instant.now().plusSeconds(3600), Instant.now());
        fixture.links.assignShortCode(link.getId(), "rev123", Instant.now());

        assertCode("SHORT_LINK_INVALID", () -> fixture.facade.resolveShortLink("rev123"));
    }

    @Test
    void resolveShortLinkFailsForNonExistentCode() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "test-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);

        assertCode("SHORT_LINK_NOT_FOUND", () -> fixture.facade.resolveShortLink("notfound"));
    }

    @Test
    void createShortUrlAssignsShortCodeAndKeepsRawToken() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "short-url-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));

        ShareLink link = fixture.addLink(gallery, "raw-token", Instant.now().plusSeconds(3600), null);
        CreateShortUrlResult result = fixture.facade.createShortUrl(link.getId().toString());

        assertNotNull(result.shortCode());
        assertEquals(6, result.shortCode().length());
        assertTrue(result.shortUrl().matches("https://viewer\\.test/s/[A-Za-z0-9]{6}"));
        ShareLink updated = fixture.links.findById(link.getId()).orElseThrow();
        assertEquals(result.shortCode(), updated.getShortCode());
        assertEquals("raw-token", updated.getRawToken());
    }

    @Test
    void createShortUrlRotatesTokenForLegacyLinkMissingRawToken() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "legacy-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));

        // 短链接功能上线前创建的链接没有保存 rawToken
        UUID id = UUID.randomUUID();
        ShareLink legacy = new ShareLink(id, gallery.id(), fixture.tokens.hashToken("legacy-token"), null,
                Instant.now().plusSeconds(3600), null, null, CREATED_AT, CREATED_AT);
        fixture.links.save(legacy);

        CreateShortUrlResult result = fixture.facade.createShortUrl(id.toString());

        ShareLink updated = fixture.links.findById(id).orElseThrow();
        assertNotNull(updated.getRawToken());
        assertFalse(updated.getRawToken().isBlank());
        assertEquals(fixture.tokens.hashToken(updated.getRawToken()), updated.getTokenHash());
        assertEquals(result.shortCode(), updated.getShortCode());

        // 轮换后的 token 必须能让短链接重定向成功
        ShortLinkTarget target = fixture.facade.resolveShortLink(result.shortCode());
        assertEquals("https://viewer.test/g/legacy-gallery?t=" + updated.getRawToken(), target.fullUrl());
    }

    @Test
    void createShortUrlIsIdempotent() {
        UUID tenantId = UUID.randomUUID();
        Gallery gallery = gallery(tenantId, "idempotent-gallery");
        Fixture fixture = new Fixture(tenantId, gallery);
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER));

        ShareLink link = fixture.addLink(gallery, "raw-token", Instant.now().plusSeconds(3600), null);
        CreateShortUrlResult first = fixture.facade.createShortUrl(link.getId().toString());
        CreateShortUrlResult second = fixture.facade.createShortUrl(link.getId().toString());

        assertEquals(first.shortCode(), second.shortCode());
        assertEquals(first.shortUrl(), second.shortUrl());
    }

    private static ShareLinkView viewFor(List<ShareLinkView> views, UUID id) {
        return views.stream().filter(view -> view.id().equals(id)).findFirst().orElseThrow();
    }

    private static Gallery gallery(UUID tenantId, String slug) {
        return new Gallery(UUID.randomUUID(), tenantId, slug, slug + " title", GalleryVisibility.PRIVATE,
                null, null, false, CREATED_AT);
    }

    private static void assertCode(String code, Runnable action) {
        DomainException exception = assertThrows(DomainException.class, action::run);
        assertEquals(code, exception.code());
    }

    private static final class Fixture {
        final GalleryStore galleries = new GalleryStore();
        final ShareLinkStore links = new ShareLinkStore();
        final PhotoStore photos = new PhotoStore();
        final StorageObjectStore storageObjects = new StorageObjectStore();
        final NoOpObjectStoragePort objectStorage = new NoOpObjectStoragePort();
        final FixedTokenGenerator tokens = new FixedTokenGenerator();
        final NoOpSharePosterService posterService = new NoOpSharePosterService();
        final ShareLinkFacade facade = new ShareLinkFacade(links, galleries, photos, storageObjects, 
                objectStorage, tokens, "https://viewer.test", posterService);

        Fixture(UUID tenantId, Gallery gallery) {
            galleries.values.put(gallery.id(), gallery);
        }

        ShareLink addLink(Gallery gallery, String rawToken, Instant expiresAt, Instant revokedAt) {
            UUID id = UUID.randomUUID();
            ShareLink link = new ShareLink(id, gallery.id(), tokens.hashToken(rawToken), null, rawToken,
                    expiresAt, revokedAt, null, CREATED_AT, CREATED_AT);
            links.save(link);
            return link;
        }
    }

    private static final class GalleryStore implements GalleryRepository {
        final Map<UUID, Gallery> values = new HashMap<>();

        public List<Gallery> findAll(UUID tenantId) {
            return new ArrayList<>(values.values());
        }

        public Optional<Gallery> findByTenantAndSlug(UUID tenantId, String slug) {
            return findBySlug(slug).filter(gallery -> gallery.tenantId().equals(tenantId));
        }

        public Optional<Gallery> findBySlug(String slug) {
            return values.values().stream().filter(gallery -> gallery.slug().equals(slug)).findFirst();
        }

        public Optional<Gallery> findById(UUID galleryId) {
            return Optional.ofNullable(values.get(galleryId));
        }

        public Optional<Gallery> findById(UUID tenantId, UUID galleryId) {
            return findById(galleryId).filter(gallery -> gallery.tenantId().equals(tenantId));
        }

        public Gallery save(Gallery gallery) {
            values.put(gallery.id(), gallery);
            return gallery;
        }

        public void update(Gallery gallery) {
            values.put(gallery.id(), gallery);
        }

        public void updateCoverPhoto(UUID tenantId, UUID galleryId, UUID coverPhotoId) {
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

        public Optional<ShareLink> findByShortCode(String shortCode) {
            return values.values().stream().filter(link -> shortCode.equals(link.getShortCode())).findFirst();
        }

        public void assignShortCode(UUID id, String shortCode, Instant updatedAt) {
            ShareLink link = values.get(id);
            if (link == null) return;
            values.put(id, new ShareLink(link.getId(), link.getGalleryId(), link.getTokenHash(), shortCode,
                    link.getRawToken(), link.getExpiresAt(), link.getRevokedAt(), link.getLastAccessedAt(), link.getCreatedAt(), updatedAt));
        }

        public void rotateToken(UUID id, String tokenHash, String rawToken, Instant updatedAt) {
            ShareLink link = values.get(id);
            if (link == null) return;
            values.put(id, new ShareLink(link.getId(), link.getGalleryId(), tokenHash, link.getShortCode(),
                    rawToken, link.getExpiresAt(), link.getRevokedAt(), link.getLastAccessedAt(), link.getCreatedAt(), updatedAt));
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
                        link.getShortCode(), link.getRawToken(), link.getExpiresAt(), link.getRevokedAt(), lastAccessedAt, 
                        link.getCreatedAt(), lastAccessedAt));
            }
        }

        public void delete(UUID id) {
            values.remove(id);
        }
    }

    private static final class FixedTokenGenerator implements TokenGenerator {
        public String generateToken() {
            return "raw-token";
        }

        public String hashToken(String rawToken) {
            return "hash:" + Integer.toHexString(rawToken.hashCode());
        }

        public boolean verifyToken(String rawToken, String tokenHash) {
            return hashToken(rawToken).equals(tokenHash);
        }
    }

    private static final class PhotoStore implements PhotoRepository {
        public Photo save(Photo photo) { return photo; }
        public List<Photo> findByGallery(UUID tenantId, UUID galleryId) { return List.of(); }
        public Optional<Photo> findById(UUID tenantId, UUID photoId) { return Optional.empty(); }
        public Optional<Photo> findById(UUID photoId) { return Optional.empty(); }
        public int countByGalleryId(UUID galleryId) { return 0; }
        public List<Photo> findByGalleryIdWithPagination(UUID galleryId, int offset, int limit) { return List.of(); }
        public List<Photo> findPublicReadyByGalleryId(UUID tenantId, UUID galleryId, int offset, int limit) { return List.of(); }
        public int countPublicReadyByGalleryId(UUID tenantId, UUID galleryId) { return 0; }
        public int countFailedByGalleryId(UUID tenantId, UUID galleryId) { return 0; }
        public int updateStatus(UUID tenantId, UUID photoId, PhotoStatus status) { return 0; }
        public int updateMetadata(UUID tenantId, UUID photoId, String title, Integer sortOrder, Boolean cover) { return 0; }
        public int clearCoverByGallery(UUID tenantId, UUID galleryId) { return 0; }
        public int softDelete(UUID tenantId, UUID photoId) { return 0; }
    }

    private static final class NoOpSharePosterService extends SharePosterService {
        public NoOpSharePosterService() {
            super(null, null);
        }
        @Override
        public String generatePoster(GalleryInfo gallery, String shareUrl, PosterTemplate template) {
            return "https://test.example.com/poster.png";
        }
        @Override
        public byte[] generateQrCodePng(String content) {
            return new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
        }
    }

    private static final class StorageObjectStore implements StorageObjectRepository {
        public StorageObject save(StorageObject object) { return object; }
        public Optional<StorageObject> findById(UUID tenantId, UUID objectId) { return Optional.empty(); }
        public int markReady(UUID tenantId, UUID objectId, String thumbnailKey, Integer width, Integer height) { return 0; }
        public int markFailed(UUID tenantId, UUID objectId) { return 0; }
        public int softDelete(UUID tenantId, UUID objectId) { return 0; }
    }

    private static final class NoOpObjectStoragePort implements ObjectStoragePort {
        public StoredObject put(String key, java.io.InputStream content, String contentType, long size) { return null; }
        public java.io.InputStream get(String key) { return null; }
        public void delete(String key) {}
        public java.net.URI createReadUrl(String key, java.time.Duration ttl) { 
            return java.net.URI.create("https://storage.test/" + key); 
        }
    }
}
