package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.PhotoProcessingTask;
import cn.vie.vibe.gallery.domain.TaskStatus;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class PhotoProcessingTaskStateMachineTest {
    private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");

    private PhotoProcessingTask task(TaskStatus status, int progress, int attempts, int maxAttempts) {
        UUID tenant = UUID.randomUUID();
        return new PhotoProcessingTask(UUID.randomUUID(), tenant, UUID.randomUUID(), UUID.randomUUID(), "sample.jpg",
                status, progress, "THUMBNAIL", attempts, maxAttempts, null, null, null, null, null,
                null, null, null, null, null, null, null, NOW, NOW);
    }

    @Test
    void legacyPendingIsNormalizedToQueued() {
        assertEquals(TaskStatus.QUEUED, task(TaskStatus.PENDING, 0, 0, 3).status());
    }

    @Test
    void progressNeverMovesBackwardsAndIsClamped() {
        PhotoProcessingTask processing = task(TaskStatus.PROCESSING, 60, 1, 3);
        assertEquals(60, processing.withProgress(20, "VALIDATE", NOW).progress());
        assertEquals(100, processing.withProgress(150, "FINALIZE", NOW).progress());
    }

    @Test
    void terminalStatesCannotBeRetried() {
        assertFalse(task(TaskStatus.SUCCEEDED, 100, 1, 3).retryable());
        assertFalse(task(TaskStatus.CANCELLED, 0, 1, 3).retryable());
        assertFalse(task(TaskStatus.FAILED, 100, 3, 3).retryable());
        assertTrue(task(TaskStatus.FAILED, 50, 2, 3).retryable());
    }

    @Test
    void terminalTransitionSetsFinishedAt() {
        PhotoProcessingTask completed = task(TaskStatus.PROCESSING, 80, 1, 3).withStatus(TaskStatus.SUCCEEDED, NOW);
        assertEquals(TaskStatus.SUCCEEDED, completed.status());
        assertEquals(NOW, completed.finishedAt());
        assertTrue(completed.isTerminal());
    }
}
