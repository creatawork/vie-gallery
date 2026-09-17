package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.QuotaOperation;
import cn.vie.vibe.gallery.domain.QuotaOperationType;
import cn.vie.vibe.gallery.domain.TenantQuota;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class QuotaConsistencyTest {
    private InMemoryQuotaRepository quotaRepo;
    private InMemoryQuotaOperationRepository opRepo;

    @BeforeEach
    void setUp() {
        opRepo = new InMemoryQuotaOperationRepository();
        quotaRepo = new InMemoryQuotaRepository(opRepo);
    }

    @Test
    void releaseOnceShouldBeIdempotent() {
        UUID tenantId = UUID.randomUUID();
        UUID photoId = UUID.randomUUID();
        long initialBytes = 1000L;
        long releaseBytes = 500L;

        quotaRepo.reserve(tenantId, initialBytes, 2);
        assertEquals(initialBytes, quotaRepo.getUsedBytes(tenantId));
        assertEquals(2, quotaRepo.getPhotoCount(tenantId));

        // First release call should succeed and decrement quota
        boolean first = quotaRepo.releaseOnce(tenantId, "PHOTO", photoId, releaseBytes, 1);
        assertTrue(first);
        assertEquals(500L, quotaRepo.getUsedBytes(tenantId));
        assertEquals(1, quotaRepo.getPhotoCount(tenantId));

        // Duplicate release call for the same photo should be ignored (idempotent)
        boolean second = quotaRepo.releaseOnce(tenantId, "PHOTO", photoId, releaseBytes, 1);
        assertFalse(second);
        assertEquals(500L, quotaRepo.getUsedBytes(tenantId));
        assertEquals(1, quotaRepo.getPhotoCount(tenantId));

        // Another duplicate release call
        boolean third = quotaRepo.releaseOnce(tenantId, "PHOTO", photoId, releaseBytes, 1);
        assertFalse(third);
        assertEquals(500L, quotaRepo.getUsedBytes(tenantId));
        assertEquals(1, quotaRepo.getPhotoCount(tenantId));
    }

    @Test
    void differentEntitiesCanReleaseIndependently() {
        UUID tenantId = UUID.randomUUID();
        UUID photo1 = UUID.randomUUID();
        UUID photo2 = UUID.randomUUID();

        quotaRepo.reserve(tenantId, 2000L, 2);

        assertTrue(quotaRepo.releaseOnce(tenantId, "PHOTO", photo1, 1000L, 1));
        assertEquals(1000L, quotaRepo.getUsedBytes(tenantId));
        assertEquals(1, quotaRepo.getPhotoCount(tenantId));

        assertTrue(quotaRepo.releaseOnce(tenantId, "PHOTO", photo2, 1000L, 1));
        assertEquals(0L, quotaRepo.getUsedBytes(tenantId));
        assertEquals(0, quotaRepo.getPhotoCount(tenantId));
    }

    private static class InMemoryQuotaOperationRepository implements QuotaOperationRepository {
        private final Map<String, QuotaOperation> operations = new ConcurrentHashMap<>();

        @Override
        public boolean recordOperation(QuotaOperation operation) {
            String key = operation.entityType() + ":" + operation.entityId() + ":" + operation.operationType();
            return operations.putIfAbsent(key, operation) == null;
        }

        @Override
        public Optional<QuotaOperation> findOperation(String entityType, UUID entityId, QuotaOperationType operationType) {
            return Optional.ofNullable(operations.get(entityType + ":" + entityId + ":" + operationType));
        }
    }

    private static class InMemoryQuotaRepository implements TenantQuotaRepository {
        private final QuotaOperationRepository opRepo;
        private final AtomicLong usedBytes = new AtomicLong();
        private final AtomicLong photoCount = new AtomicLong();

        InMemoryQuotaRepository(QuotaOperationRepository opRepo) {
            this.opRepo = opRepo;
        }

        @Override
        public TenantQuota findForUpdate(UUID tenantId) {
            return new TenantQuota(tenantId, 1000000L, usedBytes.get(), 1000L, photoCount.get());
        }

        @Override
        public void ensure(UUID tenantId, long maxBytes, long maxPhotos) {}

        @Override
        public void reserve(UUID tenantId, long bytes, long photos) {
            usedBytes.addAndGet(bytes);
            photoCount.addAndGet(photos);
        }

        @Override
        public void release(UUID tenantId, long bytes, long photos) {
            usedBytes.updateAndGet(v -> Math.max(0, v - bytes));
            photoCount.updateAndGet(v -> Math.max(0, v - photos));
        }

        @Override
        public boolean releaseOnce(UUID tenantId, String entityType, UUID entityId, long bytes, long photos) {
            if (entityType != null && entityId != null && opRepo != null) {
                QuotaOperation op = QuotaOperation.release(tenantId, entityType, entityId, bytes, (int) photos, Instant.now());
                if (!opRepo.recordOperation(op)) {
                    return false;
                }
            }
            release(tenantId, bytes, photos);
            return true;
        }

        long getUsedBytes(UUID tenantId) {
            return usedBytes.get();
        }

        long getPhotoCount(UUID tenantId) {
            return photoCount.get();
        }
    }
}
