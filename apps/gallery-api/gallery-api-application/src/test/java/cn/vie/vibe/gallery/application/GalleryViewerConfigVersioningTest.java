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
import static org.junit.jupiter.api.Assertions.assertNull;
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
        ViewerConfigVersion first = fixture.facade.publishConfig(galleryId, 1, " 第一版 ", "initial\nrelease");
        fixture.facade.saveConfig(galleryId, "{\"preset\":\"two\"}", "two");
        ViewerConfigVersion second = fixture.facade.publishConfig(galleryId);

        assertEquals(2, fixture.versions.versions.size());
        assertEquals(1L, first.versionNumber());
        assertEquals(2L, second.versionNumber());
        assertEquals("第一版", first.title());
        assertEquals("initial\nrelease", first.note());
        assertNull(second.title());
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
    void restoreUpdatesOnlyDraftAndNextPublishKeepsTheSequence() {
        UUID galleryId = UUID.randomUUID();
        Fixture fixture = fixture(galleryId, MembershipRole.OWNER);
        fixture.facade.saveConfig(galleryId, "{\"preset\":\"one\"}", "one");
        ViewerConfigVersion first = fixture.facade.publishConfig(galleryId);
        fixture.facade.saveConfig(galleryId, "{\"preset\":\"two\"}", "two");
        ViewerConfigVersion second = fixture.facade.publishConfig(galleryId);

        GalleryViewerConfig restored = fixture.facade.restoreVersion(galleryId, first.id());

        assertEquals(first.configJson(), restored.configJson());
        assertEquals(second.id(), restored.publishedVersionId());
        assertEquals(second.configJson(), fixture.facade.getPublicConfig("demo").orElseThrow().configJson());
        assertEquals(2, fixture.versions.versions.size());
        assertEquals(3L, fixture.facade.publishConfig(galleryId).versionNumber());
    }

    @Test
    void deletedVersionIsHiddenAndDeleteIsIdempotentButCurrentVersionIsProtected() {
        UUID galleryId = UUID.randomUUID();
        Fixture fixture = fixture(galleryId, MembershipRole.OWNER);
        fixture.facade.saveConfig(galleryId, "{\"preset\":\"one\"}", "one");
        ViewerConfigVersion first = fixture.facade.publishConfig(galleryId);
        fixture.facade.saveConfig(galleryId, "{\"preset\":\"two\"}", "two");
        ViewerConfigVersion current = fixture.facade.publishConfig(galleryId);

        fixture.facade.deleteVersion(galleryId, first.id());
        fixture.facade.deleteVersion(galleryId, first.id());

        assertEquals(1, fixture.facade.listVersions(galleryId).total());
        DomainException read = assertThrows(DomainException.class, () -> fixture.facade.getVersion(galleryId, first.id()));
        assertEquals("CONFIG_VERSION_NOT_FOUND", read.code());
        DomainException edit = assertThrows(DomainException.class,
                () -> fixture.facade.updateVersionMetadata(galleryId, first.id(), "gone", null));
        assertEquals("CONFIG_VERSION_NOT_FOUND", edit.code());
        DomainException restore = assertThrows(DomainException.class, () -> fixture.facade.restoreVersion(galleryId, first.id()));
        assertEquals("CONFIG_VERSION_NOT_FOUND", restore.code());
        DomainException deleteCurrent = assertThrows(DomainException.class,
                () -> fixture.facade.deleteVersion(galleryId, current.id()));
        assertEquals("CONFIG_VERSION_CURRENT", deleteCurrent.code());
    }

    @Test
    void metadataUpdateChangesOnlyMetadataAndRollbackCreatesAnUnnamedVersion() {
        UUID galleryId = UUID.randomUUID();
        Fixture fixture = fixture(galleryId, MembershipRole.OWNER);
        fixture.facade.saveConfig(galleryId, "{}", "default");
        ViewerConfigVersion original = fixture.facade.publishConfig(galleryId);
        ViewerConfigVersion edited = fixture.facade.updateVersionMetadata(galleryId, original.id(), " 春季 ", " note ");

        assertEquals("春季", edited.title());
        assertEquals("note", edited.note());
        assertEquals(original.configJson(), edited.configJson());
        assertEquals(original.createdAt(), edited.createdAt());
        ViewerConfigVersion rollback = fixture.facade.rollbackConfig(galleryId, edited.id());
        assertNotEquals(original.id(), rollback.id());
        assertEquals(2L, rollback.versionNumber());
        assertNull(rollback.title());
        assertNull(rollback.note());
    }

    @Test
    void metadataSaveReadsSnapshotOnlyOnceAndMissingVersionDoesNotReadSnapshot() {
        UUID galleryId = UUID.randomUUID();
        Fixture fixture = fixture(galleryId, MembershipRole.OWNER);
        fixture.facade.saveConfig(galleryId, "{}", "default");
        ViewerConfigVersion original = fixture.facade.publishConfig(galleryId);
        fixture.versions.snapshotReads = 0;

        ViewerConfigVersion edited = fixture.facade.updateVersionMetadata(galleryId, original.id(), " 春季 ", " note ");

        assertEquals(1, fixture.versions.snapshotReads);
        assertEquals("春季", edited.title());
        assertEquals(original.configJson(), edited.configJson());
        assertEquals(edited, fixture.versions.findById(TENANT_ID, galleryId, original.id()).orElseThrow());
        fixture.versions.snapshotReads = 0;
        DomainException missing = assertThrows(DomainException.class,
                () -> fixture.facade.updateVersionMetadata(galleryId, UUID.randomUUID(), "new", null));
        assertEquals("CONFIG_VERSION_NOT_FOUND", missing.code());
        assertEquals(0, fixture.versions.snapshotReads);
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
        ViewerConfigVersion readable = ViewerConfigVersion.create(TENANT_ID, galleryId, 1,
                "{}", "default", 1, "name", "note", USER_ID);
        fixture.versions.save(readable);

        DomainException publish = assertThrows(DomainException.class, () -> fixture.facade.publishConfig(galleryId));
        DomainException rollback = assertThrows(DomainException.class,
                () -> fixture.facade.rollbackConfig(galleryId, UUID.randomUUID()));
        DomainException metadata = assertThrows(DomainException.class,
                () -> fixture.facade.updateVersionMetadata(galleryId, readable.id(), "new", null));
        DomainException restore = assertThrows(DomainException.class,
                () -> fixture.facade.restoreVersion(galleryId, readable.id()));
        DomainException delete = assertThrows(DomainException.class,
                () -> fixture.facade.deleteVersion(galleryId, readable.id()));

        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, publish.code());
        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, rollback.code());
        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, metadata.code());
        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, restore.code());
        assertEquals(WorkspaceAuthorizationPolicy.ROLE_REQUIRED_CODE, delete.code());
        assertEquals(readable.id(), fixture.facade.getVersion(galleryId, readable.id()).id());
    }

    @Test void invalidSavePublishAndRollbackPerformNoWrites() {
        UUID galleryId = UUID.randomUUID();
        Fixture fixture = fixture(galleryId, MembershipRole.OWNER);
        fixture.facade.saveConfig(galleryId, "{}", "custom");
        ViewerConfigVersion published = fixture.facade.publishConfig(galleryId);
        int configWrites = fixture.configs.writes;
        assertThrows(DomainException.class, () -> fixture.facade.saveConfig(galleryId, "{\"particles\":{\"density\":3}}", "bad"));
        assertEquals(configWrites, fixture.configs.writes);
        // Deliberately corrupt storage to exercise old invalid snapshots.
        fixture.configs.values.put(galleryId, GalleryViewerConfig.create(galleryId, "[]", "bad"));
        ViewerConfigVersion corrupt = ViewerConfigVersion.create(TENANT_ID, galleryId, 2, "[]", "bad", 1, null, null, USER_ID);
        fixture.versions.versions.add(corrupt);
        int count = fixture.versions.versions.size();
        assertThrows(DomainException.class, () -> fixture.facade.publishConfig(galleryId));
        assertThrows(DomainException.class, () -> fixture.facade.rollbackConfig(galleryId, corrupt.id()));
        assertEquals(count, fixture.versions.versions.size());
        assertEquals(configWrites, fixture.configs.writes);
        assertEquals(published.id(), fixture.versions.published.get(galleryId));
    }

    @Test
    void invalidPublishMetadataIsRejectedBeforeAllocatingOrSaving() {
        UUID galleryId = UUID.randomUUID();
        Fixture fixture = fixture(galleryId, MembershipRole.OWNER);
        fixture.facade.saveConfig(galleryId, "{}", "default");

        DomainException invalid = assertThrows(DomainException.class,
                () -> fixture.facade.publishConfig(galleryId, 1, "x".repeat(61), null));

        assertEquals("CONFIG_VERSION_METADATA_INVALID", invalid.code());
        assertEquals(0, fixture.versions.versions.size());
        assertNull(fixture.configs.values.get(galleryId).publishedVersionId());
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
        private int writes;
        private final java.util.Map<UUID, GalleryViewerConfig> values = new java.util.HashMap<>();

        @Override
        public Optional<GalleryViewerConfig> findByGalleryId(UUID galleryId) {
            return Optional.ofNullable(values.get(galleryId));
        }

        @Override
        public void save(GalleryViewerConfig config) {
            writes++;
            values.put(config.galleryId(), config);
        }

        @Override
        public int deleteByGalleryId(UUID galleryId) {
            return values.remove(galleryId) == null ? 0 : 1;
        }
    }

    private static final class InMemoryVersionRepository implements ViewerConfigVersionRepository {
        private int snapshotReads;
        private final List<ViewerConfigVersion> versions = new ArrayList<>();
        private final java.util.Map<UUID, UUID> published = new java.util.HashMap<>();
        private final java.util.Map<UUID, Long> counters = new java.util.HashMap<>();
        private final java.util.concurrent.ConcurrentMap<UUID, Object> locks = new java.util.concurrent.ConcurrentHashMap<>();

        @Override
        public void save(ViewerConfigVersion version) {
            versions.add(version);
            counters.merge(version.galleryId(), version.versionNumber(), Math::max);
        }

        @Override
        public List<ViewerConfigVersion> findByGallery(UUID tenantId, UUID galleryId, int offset, int limit) {
            return versions.stream()
                    .filter(v -> v.tenantId().equals(tenantId) && v.galleryId().equals(galleryId) && v.deletedAt() == null)
                    .sorted(Comparator.comparingLong(ViewerConfigVersion::versionNumber).reversed())
                    .skip(offset).limit(limit).toList();
        }

        @Override
        public long countByGallery(UUID tenantId, UUID galleryId) {
            return versions.stream().filter(v -> v.tenantId().equals(tenantId) && v.galleryId().equals(galleryId) && v.deletedAt() == null).count();
        }

        @Override
        public Optional<ViewerConfigVersion> findById(UUID tenantId, UUID galleryId, UUID versionId) {
            snapshotReads++;
            return findByIdIncludingDeleted(tenantId, galleryId, versionId).filter(v -> v.deletedAt() == null);
        }

        @Override public Optional<ViewerConfigVersion> findByIdIncludingDeleted(UUID tenantId, UUID galleryId, UUID versionId) {
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

        @Override public void lockGallery(UUID tenantId, UUID galleryId) { }
        @Override public <T> T withGalleryLock(UUID tenantId, UUID galleryId, java.util.function.Supplier<T> action) {
            synchronized (locks.computeIfAbsent(galleryId, ignored -> new Object())) { return action.get(); }
        }
        @Override public long allocateVersionNumber(UUID tenantId, UUID galleryId) {
            long next = Math.addExact(counters.getOrDefault(galleryId, 0L), 1L);
            counters.put(galleryId, next);
            return next;
        }
        @Override public int updateMetadata(UUID tenantId, UUID galleryId, UUID versionId, String title, String note, Instant at, UUID actor) {
            var version = findByIdIncludingDeleted(tenantId, galleryId, versionId).filter(v -> v.deletedAt() == null).orElse(null);
            if (version == null) return 0;
            versions.set(versions.indexOf(version), version.withMetadata(title, note, at, actor));
            return 1;
        }
        @Override public int softDelete(UUID tenantId, UUID galleryId, UUID versionId, Instant at, UUID actor) {
            var version = findById(tenantId, galleryId, versionId).orElse(null);
            if (version == null) return 0;
            versions.set(versions.indexOf(version), version.deleted(at, actor));
            return 1;
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
        @Override public int softDelete(UUID tenantId, UUID galleryId) { return 0; }
    }
}
