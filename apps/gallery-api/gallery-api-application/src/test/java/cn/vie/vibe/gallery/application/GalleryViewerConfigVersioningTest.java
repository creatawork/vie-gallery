package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryStatus;
import cn.vie.vibe.gallery.domain.GalleryViewerConfig;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.TenantContext;
import cn.vie.vibe.gallery.domain.ViewerConfigVersion;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class GalleryViewerConfigVersioningTest {
    private static final UUID TENANT_ID = UUID.randomUUID();
    private static final UUID USER_ID = UUID.randomUUID();

    @Test
    void savingDraftDoesNotCreateVersionOrChangePublicSnapshot() {
        UUID galleryId = UUID.randomUUID();
        Fixture fixture = fixture(galleryId, MembershipRole.OWNER);
        fixture.configs.save(GalleryViewerConfig.create(galleryId, "{\"layout\":\"sphere\"}", "first"));
        fixture.facade.publishConfig(galleryId);

        fixture.facade.saveConfig(galleryId, "{\"layout\":\"helix\"}", "second");

        assertEquals(1, fixture.versions.versions.size());
        assertEquals("{\"layout\":\"sphere\"}", fixture.facade.getPublicConfig("demo").orElseThrow().configJson());
        assertEquals("{\"layout\":\"helix\"}", fixture.facade.getConfig(galleryId).orElseThrow().configJson());
    }

    @Test
    void publishAppendsVersionAndPublicReadsLatestPublishedSnapshot() {
        UUID galleryId = UUID.randomUUID();
        Fixture fixture = fixture(galleryId, MembershipRole.EDITOR);
        fixture.facade.saveConfig(galleryId, "{\"preset\":\"one\"}", "one");
        ViewerConfigVersion first = fixture.facade.publishConfig(galleryId);
        fixture.facade.saveConfig(galleryId, "{\"preset\":\"two\"}", "two");
        ViewerConfigVersion second = fixture.facade.publishConfig(galleryId);

        assertEquals(2, fixture.versions.versions.size());
        assertNotEquals(first.id(), second.id());
        assertEquals(second.id(), fixture.facade.getConfig(galleryId).orElseThrow().publishedVersionId());
        assertEquals("{\"preset\":\"two\"}", fixture.facade.getPublicConfig("demo").orElseThrow().configJson());
    }

    @Test
    void rollbackAppendsNewVersionAndRestoresHistoricalSnapshot() {
        UUID galleryId = UUID.randomUUID();
        Fixture fixture = fixture(galleryId, MembershipRole.OWNER);
        fixture.facade.saveConfig(galleryId, "{\"preset\":\"one\"}", "one");
        ViewerConfigVersion first = fixture.facade.publishConfig(galleryId);
        fixture.facade.saveConfig(galleryId, "{\"preset\":\"two\"}", "two");
        fixture.facade.publishConfig(galleryId);

        ViewerConfigVersion rollback = fixture.facade.rollbackConfig(galleryId, first.id());

        assertEquals(3, fixture.versions.versions.size());
        assertNotEquals(first.id(), rollback.id());
        assertEquals(first.configJson(), fixture.facade.getPublicConfig("demo").orElseThrow().configJson());
        assertEquals("one", fixture.facade.getConfig(galleryId).orElseThrow().presetName());
    }

    @Test
    void unsupportedSchemaIsRejectedBeforeSaving() {
        UUID galleryId = UUID.randomUUID();
        Fixture fixture = fixture(galleryId, MembershipRole.OWNER);

        DomainException exception = assertThrows(DomainException.class,
                () -> fixture.facade.saveConfig(galleryId, "{}", "custom", 99));

        assertEquals("BAD_SCHEMA_VERSION", exception.code());
        assertEquals(0, fixture.configs.values.size());
    }

    @Test
    void viewerCannotPublishOrRollback() {
        UUID galleryId = UUID.randomUUID();
        Fixture fixture = fixture(galleryId, MembershipRole.VIEWER);

        DomainException publish = assertThrows(DomainException.class, () -> fixture.facade.publishConfig(galleryId));
        DomainException rollback = assertThrows(DomainException.class,
                () -> fixture.facade.rollbackConfig(galleryId, UUID.randomUUID()));

        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, publish.code());
        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, rollback.code());
    }

    private static Fixture fixture(UUID galleryId, MembershipRole role) {
        Gallery gallery = new Gallery(galleryId, TENANT_ID, "demo", "Demo", GalleryVisibility.PUBLIC,
                null, null, false, Instant.now(), GalleryStatus.PUBLISHED, Instant.now());
        InMemoryGalleryRepository galleries = new InMemoryGalleryRepository(gallery);
        InMemoryConfigRepository configs = new InMemoryConfigRepository();
        InMemoryVersionRepository versions = new InMemoryVersionRepository();
        GalleryViewerConfigFacade facade = new GalleryViewerConfigFacade(
                configs, versions, galleries,
                new WorkspaceAuthorizationPolicy(() -> new TenantContext(USER_ID, TENANT_ID, role)));
        return new Fixture(facade, configs, versions);
    }

    private record Fixture(GalleryViewerConfigFacade facade, InMemoryConfigRepository configs,
                           InMemoryVersionRepository versions) {}

    private static final class InMemoryConfigRepository implements GalleryViewerConfigRepository {
        private final java.util.Map<UUID, GalleryViewerConfig> values = new java.util.HashMap<>();

        @Override
        public Optional<GalleryViewerConfig> findByGalleryId(UUID galleryId) {
            return Optional.ofNullable(values.get(galleryId));
        }

        @Override
        public void save(GalleryViewerConfig config) {
            values.put(config.galleryId(), config);
        }

        @Override
        public int deleteByGalleryId(UUID galleryId) {
            return values.remove(galleryId) == null ? 0 : 1;
        }
    }

    private static final class InMemoryVersionRepository implements ViewerConfigVersionRepository {
        private final List<ViewerConfigVersion> versions = new ArrayList<>();
        private final java.util.Map<UUID, UUID> published = new java.util.HashMap<>();

        @Override
        public void save(ViewerConfigVersion version) {
            versions.add(version);
        }

        @Override
        public List<ViewerConfigVersion> findByGallery(UUID tenantId, UUID galleryId, int offset, int limit) {
            return versions.stream()
                    .filter(v -> v.tenantId().equals(tenantId) && v.galleryId().equals(galleryId))
                    .sorted(Comparator.comparing(ViewerConfigVersion::createdAt).reversed())
                    .skip(offset).limit(limit).toList();
        }

        @Override
        public long countByGallery(UUID tenantId, UUID galleryId) {
            return versions.stream().filter(v -> v.tenantId().equals(tenantId) && v.galleryId().equals(galleryId)).count();
        }

        @Override
        public Optional<ViewerConfigVersion> findById(UUID tenantId, UUID galleryId, UUID versionId) {
            return versions.stream().filter(v -> v.id().equals(versionId) && v.tenantId().equals(tenantId)
                    && v.galleryId().equals(galleryId)).findFirst();
        }

        @Override
        public Optional<ViewerConfigVersion> findPublishedByGallery(UUID tenantId, UUID galleryId) {
            UUID id = published.get(galleryId);
            return id == null ? Optional.empty() : findById(tenantId, galleryId, id);
        }

        @Override
        public int publish(UUID tenantId, UUID galleryId, UUID versionId, Instant publishedAt) {
            if (findById(tenantId, galleryId, versionId).isEmpty()) return 0;
            published.put(galleryId, versionId);
            return 1;
        }

        @Override
        public int clearPublished(UUID tenantId, UUID galleryId) {
            return published.remove(galleryId) == null ? 0 : 1;
        }
    }

    private static final class InMemoryGalleryRepository implements GalleryRepository {
        private final Gallery gallery;

        private InMemoryGalleryRepository(Gallery gallery) {
            this.gallery = gallery;
        }

        @Override public List<Gallery> findAll(UUID tenantId) { return List.of(gallery); }
        @Override public Optional<Gallery> findByTenantAndSlug(UUID tenantId, String slug) { return findBySlug(slug); }
        @Override public Optional<Gallery> findBySlug(String slug) { return gallery.slug().equals(slug) ? Optional.of(gallery) : Optional.empty(); }
        @Override public Optional<Gallery> findById(UUID galleryId) { return gallery.id().equals(galleryId) ? Optional.of(gallery) : Optional.empty(); }
        @Override public Optional<Gallery> findById(UUID tenantId, UUID galleryId) { return findById(galleryId).filter(g -> g.tenantId().equals(tenantId)); }
        @Override public Gallery save(Gallery value) { return value; }
        @Override public void update(Gallery value) { }
        @Override public void updateCoverPhoto(UUID tenantId, UUID galleryId, UUID coverPhotoId) { }
    }
}
