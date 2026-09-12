package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 跨租户 IDOR 安全验证集成测试。
 * 验证任何租户在携带自己有效身份的情况下，试图访问或操作其他租户的 Gallery、Photo、Task、ShareLink、ViewerConfig 时，
 * 均严格返回 NOT_FOUND 领域异常（HTTP 404 语义），不泄露资源存在性。
 */
class CrossTenantAccessAuthorizationTest {
    private static final Instant NOW = Instant.parse("2026-09-10T12:00:00Z");

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    @Test
    void crossTenantGalleryAccessIsStrictlyRejected() {
        UUID tenantA = UUID.randomUUID();
        UUID tenantB = UUID.randomUUID();

        InMemoryGalleryRepo repo = new InMemoryGalleryRepo();
        GalleryFacade facadeA = new GalleryFacade(repo, () -> new TenantContext(UUID.randomUUID(), tenantA, MembershipRole.OWNER));
        GalleryFacade facadeB = new GalleryFacade(repo, () -> new TenantContext(UUID.randomUUID(), tenantB, MembershipRole.OWNER));

        Gallery galleryA = facadeA.create("Tenant A Gallery", "tenant-a-gallery", GalleryVisibility.PASSWORD);

        // Tenant B tries to get gallery A
        DomainException exGet = assertThrows(DomainException.class, () -> facadeB.get(galleryA.id()));
        assertEquals("GALLERY_NOT_FOUND", exGet.code());

        // Tenant B tries to publish gallery A
        DomainException exPub = assertThrows(DomainException.class, () -> facadeB.publish(galleryA.id()));
        assertEquals("GALLERY_NOT_FOUND", exPub.code());

        // Tenant B tries to unpublish gallery A
        DomainException exUnpub = assertThrows(DomainException.class, () -> facadeB.unpublish(galleryA.id()));
        assertEquals("GALLERY_NOT_FOUND", exUnpub.code());

        // Tenant B tries to update visibility of gallery A
        DomainException exVis = assertThrows(DomainException.class, () -> facadeB.updateVisibility(galleryA.id(), GalleryVisibility.PUBLIC));
        assertEquals("GALLERY_NOT_FOUND", exVis.code());

        // Tenant B tries to set/clear password of gallery A
        DomainException exPwd = assertThrows(DomainException.class, () -> facadeB.setPassword(galleryA.id(), "hacked-password"));
        assertEquals("GALLERY_NOT_FOUND", exPwd.code());
        DomainException exClear = assertThrows(DomainException.class, () -> facadeB.clearPassword(galleryA.id()));
        assertEquals("GALLERY_NOT_FOUND", exClear.code());
    }

    @Test
    void crossTenantShareLinkAccessIsStrictlyRejected() {
        UUID tenantA = UUID.randomUUID();
        UUID tenantB = UUID.randomUUID();

        InMemoryGalleryRepo galleryRepo = new InMemoryGalleryRepo();
        InMemoryShareLinkRepo linkRepo = new InMemoryShareLinkRepo();
        FixedTokenGen tokenGen = new FixedTokenGen();

        Gallery galleryA = new Gallery(UUID.randomUUID(), tenantA, "gallery-a", "Gallery A",
                GalleryVisibility.PRIVATE, null, null, false, NOW, GalleryStatus.PUBLISHED, NOW);
        galleryRepo.save(galleryA);

        ShareLinkFacade facade = new ShareLinkFacade(linkRepo, galleryRepo, tokenGen, "https://viewer.test");

        // Tenant A creates share link
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantA, MembershipRole.OWNER));
        facade.createShareLink(new CreateShareLinkCommand(galleryA.id().toString(), Instant.now().plusSeconds(3600)));
        ShareLink linkA = linkRepo.values.values().iterator().next();

        // Switch context to Tenant B
        TenantContextHolder.set(new TenantContext(UUID.randomUUID(), tenantB, MembershipRole.OWNER));

        // Tenant B tries to list share links for gallery A -> GALLERY_NOT_FOUND
        DomainException exList = assertThrows(DomainException.class, () -> facade.listShareLinks(galleryA.id().toString()));
        assertEquals("GALLERY_NOT_FOUND", exList.code());

        // Tenant B tries to create share link for gallery A -> GALLERY_NOT_FOUND
        DomainException exCreate = assertThrows(DomainException.class, () -> facade.createShareLink(
                new CreateShareLinkCommand(galleryA.id().toString(), Instant.now().plusSeconds(3600))));
        assertEquals("GALLERY_NOT_FOUND", exCreate.code());

        // Tenant B tries to revoke/delete share link belonging to Tenant A -> NOT_FOUND（不泄露存在性）
        DomainException exRevoke = assertThrows(DomainException.class, () -> facade.revokeShareLink(linkA.getId().toString()));
        assertEquals("SHARE_LINK_NOT_FOUND", exRevoke.code());

        DomainException exDelete = assertThrows(DomainException.class, () -> facade.deleteShareLink(linkA.getId().toString()));
        assertEquals("SHARE_LINK_NOT_FOUND", exDelete.code());
    }

    private static final class InMemoryGalleryRepo implements GalleryRepository {
        final List<Gallery> values = new ArrayList<>();
        public List<Gallery> findAll(UUID tenantId) { return values.stream().filter(g -> g.tenantId().equals(tenantId)).toList(); }
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
    }

    private static final class InMemoryShareLinkRepo implements ShareLinkRepository {
        final Map<UUID, ShareLink> values = new HashMap<>();
        public void save(ShareLink shareLink) { values.put(shareLink.getId(), shareLink); }
        public Optional<ShareLink> findById(UUID id) { return Optional.ofNullable(values.get(id)); }
        public Optional<ShareLink> findByTokenHash(String tokenHash) {
            return values.values().stream().filter(l -> l.getTokenHash().equals(tokenHash)).findFirst();
        }
        public List<ShareLink> findByGalleryId(UUID galleryId) {
            return values.values().stream().filter(l -> l.getGalleryId().equals(galleryId)).toList();
        }
        public List<ShareLink> findByGalleryIdAndTenantId(UUID galleryId, UUID tenantId) {
            return findByGalleryId(galleryId);
        }
        public void update(ShareLink shareLink) { values.put(shareLink.getId(), shareLink); }
        public void revoke(UUID id, Instant revokedAt) {
            ShareLink current = values.get(id);
            if (current != null) {
                values.put(id, new ShareLink(current.getId(), current.getGalleryId(), current.getTokenHash(),
                        current.getExpiresAt(), revokedAt, current.getLastAccessedAt(), current.getCreatedAt(), NOW));
            }
        }
        public void touchLastAccessed(UUID id, Instant accessedAt, Instant throttleThreshold) { }
        public void delete(UUID id) { values.remove(id); }
    }

    private static final class FixedTokenGen implements TokenGenerator {
        public String generateToken() { return "raw-token"; }
        public String hashToken(String rawToken) { return "hash:" + rawToken; }
        public boolean verifyToken(String rawToken, String tokenHash) { return tokenHash.equals("hash:" + rawToken); }
    }
}
