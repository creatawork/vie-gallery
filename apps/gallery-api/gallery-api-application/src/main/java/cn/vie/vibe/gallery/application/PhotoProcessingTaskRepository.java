package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.PhotoProcessingTask;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PhotoProcessingTaskRepository {
    PhotoProcessingTask save(PhotoProcessingTask task);

    Optional<PhotoProcessingTask> findById(UUID tenantId, UUID taskId);

    default Optional<PhotoProcessingTask> findByTenantAndIdempotencyKey(UUID tenantId, String idempotencyKey) {
        return Optional.empty();
    }

    default List<PhotoProcessingTask> findByGallery(UUID tenantId, UUID galleryId, TaskFilter filter, long offset, int limit) {
        return List.of();
    }

    default long countByGallery(UUID tenantId, UUID galleryId, TaskFilter filter) {
        return 0;
    }

    default TaskSummary summaryByGallery(UUID tenantId, UUID galleryId) {
        return TaskSummary.empty();
    }

    default Optional<PhotoProcessingTask> claimNext(Instant now, String workerId) {
        return Optional.empty();
    }

    default int heartbeat(UUID tenantId, UUID taskId, String workerId, Instant now) {
        return 0;
    }

    default int progress(UUID tenantId, UUID taskId, String workerId, int progress, String stage, Instant now) {
        return 0;
    }

    default int cancelProcessing(UUID tenantId, UUID taskId, String workerId, Instant now) {
        return 0;
    }

    default int complete(UUID tenantId, UUID taskId, String workerId, Instant now) {
        return 0;
    }

    default int fail(UUID tenantId, UUID taskId, String workerId, String errorCode, String errorMessage,
                     String requestId, boolean terminal, Instant nextAttemptAt, Instant now) {
        return 0;
    }

    default int retry(UUID tenantId, UUID taskId, Instant nextAttemptAt, Instant now) {
        return 0;
    }

    default int requestCancel(UUID tenantId, UUID taskId, Instant now) {
        return 0;
    }

    default int cancelQueued(UUID tenantId, UUID taskId, Instant now) {
        return 0;
    }

    default int recoverStale(Instant threshold, Instant now) {
        return 0;
    }

    /** Compatibility helper for the pre-M6 worker. */
    default Optional<PhotoProcessingTask> claimNext() {
        return claimNext(Instant.now(), "legacy-worker");
    }

    /** Compatibility helper for the pre-M6 worker. */
    default int succeed(UUID taskId) {
        return complete(null, taskId, null, Instant.now());
    }

    /** Compatibility helper for the pre-M6 worker. */
    default int fail(UUID taskId, String errorMessage, boolean terminal) {
        return fail(null, taskId, null, "IMAGE_PROCESSING_FAILED", errorMessage, null, terminal, Instant.now(), Instant.now());
    }
}
