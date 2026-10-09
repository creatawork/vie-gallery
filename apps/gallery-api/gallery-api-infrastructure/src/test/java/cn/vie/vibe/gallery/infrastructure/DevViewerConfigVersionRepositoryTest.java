package cn.vie.vibe.gallery.infrastructure;

import cn.vie.vibe.gallery.domain.ViewerConfigVersion;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DevViewerConfigVersionRepositoryTest {
    private final DevViewerConfigVersionRepository repository = new DevViewerConfigVersionRepository();
    private final UUID tenantId = UUID.randomUUID();
    private final UUID galleryId = UUID.randomUUID();

    @Test
    void deletedNumbersStayReservedAndDeletedVersionsDisappearFromNormalReads() {
        ViewerConfigVersion first = publish(1, "first");
        publish(2, "second");

        assertEquals(1, repository.softDelete(tenantId, galleryId, first.id(), Instant.now(), UUID.randomUUID()));

        long next = repository.withGalleryLock(tenantId, galleryId,
                () -> repository.allocateVersionNumber(tenantId, galleryId));
        assertEquals(3, next);
        assertEquals(1, repository.countByGallery(tenantId, galleryId));
        assertTrue(repository.findById(tenantId, galleryId, first.id()).isEmpty());
        assertTrue(repository.findByIdIncludingDeleted(tenantId, galleryId, first.id()).orElseThrow().deletedAt() != null);
    }

    @Test
    void metadataUpdatePreservesSnapshotAndCreationTime() {
        ViewerConfigVersion original = publish(1, "original");
        Instant updatedAt = Instant.now();
        UUID actor = UUID.randomUUID();

        assertEquals(1, repository.updateMetadata(tenantId, galleryId, original.id(), "renamed", "note", updatedAt, actor));

        ViewerConfigVersion updated = repository.findById(tenantId, galleryId, original.id()).orElseThrow();
        assertEquals(original.configJson(), updated.configJson());
        assertEquals(original.createdAt(), updated.createdAt());
        assertEquals("renamed", updated.title());
        assertEquals("note", updated.note());
        assertEquals(updatedAt, updated.metadataUpdatedAt());
        assertEquals(actor, updated.metadataUpdatedByUserId());
    }

    @Test
    void failedGalleryCallbackRestoresVersionsAndCounter() {
        ViewerConfigVersion published = publish(1, "current");

        assertThrows(IllegalStateException.class, () -> repository.withGalleryLock(tenantId, galleryId, () -> {
            long number = repository.allocateVersionNumber(tenantId, galleryId);
            repository.save(ViewerConfigVersion.create(tenantId, galleryId, number, "{}", "default", 1,
                    "failed", null, UUID.randomUUID()));
            repository.publish(tenantId, galleryId, UUID.randomUUID(), Instant.now());
            throw new IllegalStateException("force rollback");
        }));

        assertEquals(1, repository.countByGallery(tenantId, galleryId));
        assertEquals(published.id(), repository.findPublishedByGallery(tenantId, galleryId).orElseThrow().id());
        assertEquals(2, repository.allocateVersionNumber(tenantId, galleryId));
    }

    @Test
    void galleryLockSerializesCallbacksForTheSameGallery() throws Exception {
        CountDownLatch firstEntered = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch secondEntered = new CountDownLatch(1);
        AtomicInteger activeCallbacks = new AtomicInteger();
        AtomicInteger maximumActive = new AtomicInteger();

        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> repository.withGalleryLock(tenantId, galleryId, () -> {
                updateActive(activeCallbacks, maximumActive);
                firstEntered.countDown();
                await(releaseFirst);
                activeCallbacks.decrementAndGet();
                return null;
            }));
            assertTrue(firstEntered.await(5, TimeUnit.SECONDS));
            var second = executor.submit(() -> repository.withGalleryLock(tenantId, galleryId, () -> {
                updateActive(activeCallbacks, maximumActive);
                secondEntered.countDown();
                activeCallbacks.decrementAndGet();
                return null;
            }));

            assertFalse(secondEntered.await(100, TimeUnit.MILLISECONDS));
            releaseFirst.countDown();
            first.get(5, TimeUnit.SECONDS);
            second.get(5, TimeUnit.SECONDS);
        } finally {
            releaseFirst.countDown();
            executor.shutdownNow();
        }
        assertEquals(1, maximumActive.get());
    }

    private ViewerConfigVersion publish(long number, String title) {
        ViewerConfigVersion version = ViewerConfigVersion.create(tenantId, galleryId, number,
                "{\"layout\":\"sphere\"}", "default", 1, title, null, UUID.randomUUID());
        repository.save(version);
        repository.publish(tenantId, galleryId, version.id(), Instant.now());
        return version;
    }

    private static void updateActive(AtomicInteger active, AtomicInteger maximum) {
        maximum.accumulateAndGet(active.incrementAndGet(), Math::max);
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) throw new AssertionError("first callback was not released");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError(exception);
        }
    }
}
