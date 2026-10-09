package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.GalleryApiApplication;
import cn.vie.vibe.gallery.application.ViewerConfigVersionRepository;
import cn.vie.vibe.gallery.domain.ViewerConfigVersion;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(classes = GalleryApiApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ViewerConfigVersionRepositoryIntegrationTest extends AbstractIntegrationTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired ViewerConfigVersionRepository versions;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void allocationDeletionAndMetadataUseGalleryScopedTransactionalRepository() {
        UUID tenantId = UUID.randomUUID();
        UUID galleryId = UUID.randomUUID();
        insertGallery(tenantId, galleryId);
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);

        ViewerConfigVersion first = transaction.execute(status -> publish(tenantId, galleryId, "first"));
        ViewerConfigVersion second = transaction.execute(status -> publish(tenantId, galleryId, "second"));
        assertEquals(1L, first.versionNumber());
        assertEquals(2L, second.versionNumber());

        transaction.executeWithoutResult(status -> {
            assertEquals(1, versions.softDelete(tenantId, galleryId, first.id(), Instant.now(), null));
            assertTrue(versions.findById(tenantId, galleryId, first.id()).isEmpty());
            assertTrue(versions.findByIdIncludingDeleted(tenantId, galleryId, first.id()).orElseThrow().deletedAt() != null);
            assertEquals(1, versions.updateMetadata(tenantId, galleryId, second.id(), "renamed", "note", Instant.now(), null));
        });

        long next = transaction.execute(status -> versions.withGalleryLock(tenantId, galleryId,
                () -> versions.allocateVersionNumber(tenantId, galleryId)));
        assertEquals(3L, next);
        ViewerConfigVersion edited = versions.findById(tenantId, galleryId, second.id()).orElseThrow();
        assertEquals("renamed", edited.title());
        assertEquals("note", edited.note());
        assertEquals(second.configJson(), edited.configJson());
        assertEquals(second.createdAt(), edited.createdAt());
        assertEquals(1L, versions.countByGallery(tenantId, galleryId));
    }

    private ViewerConfigVersion publish(UUID tenantId, UUID galleryId, String title) {
        return versions.withGalleryLock(tenantId, galleryId, () -> {
            long number = versions.allocateVersionNumber(tenantId, galleryId);
            ViewerConfigVersion version = ViewerConfigVersion.create(tenantId, galleryId, number,
                    "{\"layout\":\"sphere\"}", "default", 1, title, null, null);
            versions.save(version);
            versions.publish(tenantId, galleryId, version.id(), Instant.now());
            return version;
        });
    }

    private void insertGallery(UUID tenantId, UUID galleryId) {
        jdbc.update("INSERT INTO tenant (id, name, slug, created_at, updated_at) " +
                        "VALUES (UUID_TO_BIN(?), 'version test', ?, NOW(6), NOW(6))",
                tenantId.toString(), "version-" + tenantId.toString().substring(0, 8));
        jdbc.update("INSERT INTO gallery (id, tenant_id, slug, name, created_at, updated_at) " +
                        "VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'version test', NOW(6), NOW(6))",
                galleryId.toString(), tenantId.toString(), "gallery-" + galleryId.toString().substring(0, 8));
    }
}
