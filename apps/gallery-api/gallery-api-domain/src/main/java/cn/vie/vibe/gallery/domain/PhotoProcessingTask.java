package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

public record PhotoProcessingTask(
        UUID id,
        UUID tenantId,
        UUID galleryId,
        UUID photoId,
        String filename,
        TaskStatus status,
        int progress,
        String stage,
        int attempts,
        int maxAttempts,
        String errorCode,
        String errorMessage,
        String requestId,
        String workerId,
        Instant nextAttemptAt,
        Instant lockedAt,
        Instant heartbeatAt,
        Instant startedAt,
        Instant finishedAt,
        Instant cancelledAt,
        String clientBatchId,
        String idempotencyKey,
        Instant createdAt,
        Instant updatedAt
) {
    public PhotoProcessingTask {
        status = status == null ? TaskStatus.QUEUED : status.normalized();
        progress = Math.max(0, Math.min(100, progress));
        stage = stage == null ? "UPLOAD" : stage;
        maxAttempts = Math.max(1, maxAttempts);
        attempts = Math.max(0, attempts);
    }

    /** Compatibility constructor for the pre-M6 upload path. */
    public PhotoProcessingTask(UUID id, UUID tenantId, UUID photoId, TaskStatus status,
                               int attempts, String errorMessage, Instant lockedAt, Instant completedAt) {
        this(id, tenantId, null, photoId, null, status, 0, "UPLOAD", attempts, 3,
                null, errorMessage, null, null, null, lockedAt, null, null, completedAt,
                null, null, null, null, completedAt == null ? Instant.now() : completedAt);
    }

    public Instant completedAt() {
        return finishedAt;
    }

    public boolean retryable() {
        return status == TaskStatus.FAILED && attempts < maxAttempts;
    }

    public boolean isTerminal() {
        return status.isTerminal();
    }

    public PhotoProcessingTask withStatus(TaskStatus next, Instant now) {
        return new PhotoProcessingTask(id, tenantId, galleryId, photoId, filename, next, progress, stage,
                attempts, maxAttempts, errorCode, errorMessage, requestId, workerId, nextAttemptAt,
                lockedAt, heartbeatAt, startedAt, next == TaskStatus.SUCCEEDED || next == TaskStatus.FAILED || next == TaskStatus.CANCELLED ? now : finishedAt,
                next == TaskStatus.CANCELLED ? now : cancelledAt, clientBatchId, idempotencyKey, createdAt, now);
    }

    public PhotoProcessingTask withProgress(int nextProgress, String nextStage, Instant now) {
        return new PhotoProcessingTask(id, tenantId, galleryId, photoId, filename, status,
                Math.max(progress, nextProgress), nextStage, attempts, maxAttempts, errorCode,
                errorMessage, requestId, workerId, nextAttemptAt, lockedAt, heartbeatAt,
                startedAt, finishedAt, cancelledAt, clientBatchId, idempotencyKey, createdAt, now);
    }
}
