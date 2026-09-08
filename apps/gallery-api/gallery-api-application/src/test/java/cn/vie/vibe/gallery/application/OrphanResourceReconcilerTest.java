package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.StorageObject;
import cn.vie.vibe.gallery.domain.StorageObjectStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OrphanResourceReconcilerTest {
    private InMemoryStorageObjectRepository objectRepo;
    private TrackingStoragePort storagePort;
    private TrackingQuotaRepository quotaRepo;
    private OrphanResourceReconciler reconciler;

    @BeforeEach
    void setUp() {
        objectRepo = new InMemoryStorageObjectRepository();
        storagePort = new TrackingStoragePort();
        quotaRepo = new TrackingQuotaRepository();
        reconciler = new OrphanResourceReconciler(objectRepo, storagePort, quotaRepo);
    }

    @Test
    void scanAndCleanShouldHandleStaleUploadingAndOrphans() {
        UUID tenantId = UUID.randomUUID();
        UUID staleObjId = UUID.randomUUID();
        UUID orphanObjId = UUID.randomUUID();
        Instant oneHourAgo = Instant.now().minusSeconds(3600);

        // 1. Stale uploading object
        StorageObject staleObj = new StorageObject(
                staleObjId, tenantId, "test-bucket", "photos/stale/original", null,
                "image/jpeg", 2048L, 800, 600, "hash1",
                StorageObjectStatus.UPLOADING, oneHourAgo
        );
        objectRepo.save(staleObj);
        objectRepo.markStaleUploading(staleObj);

        // 2. Orphan stored object (no photo record)
        StorageObject orphanObj = new StorageObject(
                orphanObjId, tenantId, "test-bucket", "photos/orphan/original", "photos/orphan/thumb",
                "image/jpeg", 4096L, 1024, 768, "hash2",
                StorageObjectStatus.READY, oneHourAgo
        );
        objectRepo.save(orphanObj);
        objectRepo.markOrphan(orphanObj);

        // Execute reconciliation
        OrphanResourceReconciler.ReconciliationReport report = reconciler.scanAndClean();

        assertEquals(1, report.cleanedStaleUploading());
        assertEquals(1, report.cleanedOrphanObjects());

        // Verify storage deletion calls
        assertTrue(storagePort.deletedKeys.contains("photos/stale/original"));
        assertTrue(storagePort.deletedKeys.contains("photos/orphan/original"));
        assertTrue(storagePort.deletedKeys.contains("photos/orphan/thumb"));

        // Verify quota releases
        assertEquals(2, quotaRepo.releaseCount.get());

        // Verify DB records soft deleted
        assertEquals(StorageObjectStatus.DELETED, objectRepo.findById(tenantId, staleObjId).orElseThrow().status());
        assertEquals(StorageObjectStatus.DELETED, objectRepo.findById(tenantId, orphanObjId).orElseThrow().status());
    }

    private static class InMemoryStorageObjectRepository implements StorageObjectRepository {
        private final Map<UUID, StorageObject> objects = new ConcurrentHashMap<>();
        private final List<StorageObject> staleUploading = new ArrayList<>();
        private final List<StorageObject> orphanList = new ArrayList<>();

        void markStaleUploading(StorageObject obj) { staleUploading.add(obj); }
        void markOrphan(StorageObject obj) { orphanList.add(obj); }

        @Override
        public StorageObject save(StorageObject object) {
            objects.put(object.id(), object);
            return object;
        }

        @Override
        public Optional<StorageObject> findById(UUID tenantId, UUID objectId) {
            return Optional.ofNullable(objects.get(objectId));
        }

        @Override
        public int markReady(UUID tenantId, UUID objectId, String thumbnailKey, Integer width, Integer height) {
            return 1;
        }

        @Override
        public int markFailed(UUID tenantId, UUID objectId) {
            return 1;
        }

        @Override
        public int softDelete(UUID tenantId, UUID objectId) {
            StorageObject obj = objects.get(objectId);
            if (obj != null) {
                objects.put(objectId, new StorageObject(
                        obj.id(), obj.tenantId(), obj.bucket(), obj.objectKey(), obj.thumbnailKey(),
                        obj.mimeType(), obj.byteSize(), obj.width(), obj.height(), obj.sha256(),
                        StorageObjectStatus.DELETED, obj.createdAt()
                ));
                return 1;
            }
            return 0;
        }

        @Override
        public List<StorageObject> findStaleUploading(Instant threshold, int limit) {
            return staleUploading;
        }

        @Override
        public List<StorageObject> findOrphanObjects(Instant threshold, int limit) {
            return orphanList;
        }
    }

    private static class TrackingStoragePort implements ObjectStoragePort {
        final Set<String> deletedKeys = Collections.synchronizedSet(new HashSet<>());

        @Override
        public StoredObject put(String objectKey, InputStream content, String contentType, long size) {
            return new StoredObject("bucket", objectKey, null, size, 100, 100, "sha");
        }

        @Override
        public InputStream get(String objectKey) {
            return InputStream.nullInputStream();
        }

        @Override
        public void delete(String objectKey) {
            deletedKeys.add(objectKey);
        }

        @Override
        public java.net.URI createReadUrl(String key, java.time.Duration ttl) {
            return java.net.URI.create("https://signed.url/" + key);
        }
    }

    private static class TrackingQuotaRepository implements TenantQuotaRepository {
        final AtomicInteger releaseCount = new AtomicInteger();

        @Override
        public cn.vie.vibe.gallery.domain.TenantQuota findForUpdate(UUID tenantId) { return null; }
        @Override
        public void ensure(UUID tenantId, long maxBytes, long maxPhotos) {}
        @Override
        public void reserve(UUID tenantId, long bytes, long photos) {}
        @Override
        public void release(UUID tenantId, long bytes, long photos) {}

        @Override
        public boolean releaseOnce(UUID tenantId, String entityType, UUID entityId, long bytes, long photos) {
            releaseCount.incrementAndGet();
            return true;
        }
    }
}
