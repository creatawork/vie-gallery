package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.GalleryStatus;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.ShareLink;
import cn.vie.vibe.gallery.domain.ShareLinkStatus;
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
        assertCode("ACCESS_DENIED", () -> fixture.facade.revokeShareLink(link.getId().toString()));
        assertCode("ACCESS_DENIED", () -> fixture.facade.deleteShareLink(link.getId().toString()));
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
        final FixedTokenGenerator tokens = new FixedTokenGenerator();
        final ShareLinkFacade facade = new ShareLinkFacade(links, galleries, tokens, "https://viewer.test");

        Fixture(UUID tenantId, Gallery gallery) {
            galleries.values.put(gallery.id(), gallery);
        }

        ShareLink addLink(Gallery gallery, String rawToken, Instant expiresAt, Instant revokedAt) {
            UUID id = UUID.randomUUID();
            ShareLink link = new ShareLink(id, gallery.id(), tokens.hashToken(rawToken), expiresAt, revokedAt,
                    null, CREATED_AT, CREATED_AT);
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

        public List<ShareLink> findByGalleryId(UUID galleryId) {
            return values.values().stream().filter(link -> link.getGalleryId().equals(galleryId)).toList();
        }

        public List<ShareLink> findByGalleryIdAndTenantId(UUID galleryId, UUID tenantId) {
            return findByGalleryId(galleryId);
        }

        public void update(ShareLink shareLink) {
            values.put(shareLink.getId(), shareLink);
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
}
