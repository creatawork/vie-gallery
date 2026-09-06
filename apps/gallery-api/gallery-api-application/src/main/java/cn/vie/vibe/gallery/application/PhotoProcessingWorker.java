package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Photo;
import cn.vie.vibe.gallery.domain.PhotoProcessingTask;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import cn.vie.vibe.gallery.domain.StorageObject;
import cn.vie.vibe.gallery.domain.TaskStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Component
public class PhotoProcessingWorker {
    private static final Logger log = LoggerFactory.getLogger(PhotoProcessingWorker.class);
    private final PhotoProcessingTaskRepository tasks;
    private final PhotoRepository photos;
    private final StorageObjectRepository objects;
    private final ObjectStoragePort storage;
    private final ThumbnailProcessor thumbnails;
    private final TenantQuotaRepository quotas;
    private final String workerId = "gallery-worker-" + UUID.randomUUID();
    private final int maxAttempts;
    private final Duration staleAfter;

    public PhotoProcessingWorker(PhotoProcessingTaskRepository tasks, PhotoRepository photos, StorageObjectRepository objects,
                                 ObjectStoragePort storage, ThumbnailProcessor thumbnails) {
        this(tasks, photos, objects, storage, thumbnails, null, 3, Duration.ofMinutes(10));
    }

    @org.springframework.beans.factory.annotation.Autowired
    public PhotoProcessingWorker(PhotoProcessingTaskRepository tasks, PhotoRepository photos, StorageObjectRepository objects,
                                 ObjectStoragePort storage, ThumbnailProcessor thumbnails, TenantQuotaRepository quotas,
                                 @Value("${gallery.processing.max-retries:3}") int maxRetries,
                                 @Value("${gallery.processing.stale-after:PT10M}") Duration staleAfter) {
        this.tasks = tasks;
        this.photos = photos;
        this.objects = objects;
        this.storage = storage;
        this.thumbnails = thumbnails;
        this.quotas = quotas;
        this.maxAttempts = Math.max(1, maxRetries);
        this.staleAfter = staleAfter;
    }

    @Scheduled(fixedDelayString = "${gallery.processing.poll-interval:5000}")
    public void processBatch() {
        Instant now = Instant.now();
        tasks.recoverStale(now.minus(staleAfter), now);
        for (int i = 0; i < 8; i++) {
            var task = tasks.claimNext(now, workerId);
            if (task.isEmpty()) return;
            process(task.get());
        }
    }

    private void process(PhotoProcessingTask task) {
        Instant started = Instant.now();
        UUID objectId = null;
        try {
            if (isCancellationRequested(task)) {
                cancel(task);
                return;
            }
            tasks.progress(task.tenantId(), task.id(), workerId, 10, "VALIDATE", Instant.now());
            Photo photo = photos.findById(task.tenantId(), task.photoId()).orElseThrow(() -> new DomainException("PHOTO_NOT_FOUND", "Photo not found"));
            objectId = photo.storageObjectId();
            StorageObject object = objects.findById(task.tenantId(), objectId).orElseThrow(() -> new DomainException("STORAGE_UNAVAILABLE", "Source object not found"));
            tasks.heartbeat(task.tenantId(), task.id(), workerId, Instant.now());
            if (isCancellationRequested(task)) {
                cancel(task);
                return;
            }
            tasks.progress(task.tenantId(), task.id(), workerId, 35, "THUMBNAIL", Instant.now());
            try (InputStream in = storage.get(object.objectKey())) {
                ThumbnailProcessor.ThumbnailResult result = thumbnails.create(object.mimeType(), in);
                if (isCancellationRequested(task)) {
                    cancel(task);
                    return;
                }
                String key = "tenant/" + task.tenantId() + "/photos/" + task.photoId() + "/thumbnail";
                tasks.progress(task.tenantId(), task.id(), workerId, 80, "FINALIZE", Instant.now());
                storage.put(key, new ByteArrayInputStream(result.content()), result.contentType(), result.content().length);
                objects.markReady(task.tenantId(), object.id(), key, result.width(), result.height());
                photos.updateStatus(task.tenantId(), task.photoId(), PhotoStatus.READY);
                tasks.complete(task.tenantId(), task.id(), workerId, Instant.now());
                log.info("gallery_task_transition taskId={} photoId={} tenantId={} workerId={} attempt={} stage={} fromStatus={} toStatus={} durationMs={}",
                        task.id(), task.photoId(), task.tenantId(), workerId, task.attempts(), "FINALIZE", TaskStatus.PROCESSING, TaskStatus.SUCCEEDED,
                        Duration.between(started, Instant.now()).toMillis());
            }
        } catch (Exception exception) {
            handleFailure(task, objectId, exception, started);
        }
    }

    private boolean isCancellationRequested(PhotoProcessingTask task) {
        return tasks.findById(task.tenantId(), task.id()).map(current -> current.status() == TaskStatus.CANCEL_REQUESTED).orElse(false);
    }

    private void cancel(PhotoProcessingTask task) {
        int changed = tasks.cancelProcessing(task.tenantId(), task.id(), workerId, Instant.now());
        if (changed == 0) return;
        photos.updateStatus(task.tenantId(), task.photoId(), PhotoStatus.CANCELLED);
        photos.findById(task.tenantId(), task.photoId()).ifPresent(photo -> {
            objects.findById(task.tenantId(), photo.storageObjectId()).ifPresent(object -> {
                objects.softDelete(task.tenantId(), object.id());
                if (quotas != null) quotas.release(task.tenantId(), object.byteSize(), 1);
            });
        });
        log.info("gallery_task_transition taskId={} photoId={} tenantId={} workerId={} fromStatus={} toStatus={}",
                task.id(), task.photoId(), task.tenantId(), workerId, TaskStatus.CANCEL_REQUESTED, TaskStatus.CANCELLED);
    }

    private void handleFailure(PhotoProcessingTask task, UUID objectId, Exception exception, Instant started) {
        String code = errorCode(exception);
        boolean retryable = isRetryable(code);
        boolean terminal = !retryable || task.attempts() >= maxAttempts;
        Instant now = Instant.now();
        Instant nextAttempt = terminal ? null : now.plusSeconds(1L << Math.min(8, Math.max(0, task.attempts() - 1)));
        int changed = tasks.fail(task.tenantId(), task.id(), workerId, code, safeMessage(exception), null, terminal, nextAttempt, now);
        if (terminal && changed > 0) {
            if (objectId != null) objects.markFailed(task.tenantId(), objectId);
            photos.updateStatus(task.tenantId(), task.photoId(), PhotoStatus.FAILED);
        }
        log.warn("gallery_task_transition taskId={} photoId={} tenantId={} workerId={} attempt={} stage={} fromStatus={} toStatus={} durationMs={} errorCode={}",
                task.id(), task.photoId(), task.tenantId(), workerId, task.attempts(), task.stage(), TaskStatus.PROCESSING,
                terminal ? TaskStatus.FAILED : TaskStatus.QUEUED, Duration.between(started, now).toMillis(), code, exception);
    }

    private static String errorCode(Exception exception) {
        if (exception instanceof DomainException domain) return domain.code();
        String message = exception.getMessage();
        if (message != null && message.toLowerCase().contains("not found")) return "STORAGE_UNAVAILABLE";
        return "THUMBNAIL_PROCESSING_FAILED";
    }

    private static boolean isRetryable(String code) {
        return switch (code) {
            case "FILE_TYPE_UNSUPPORTED", "IMAGE_DECODE_FAILED", "IMAGE_DIMENSIONS_INVALID", "PHOTO_NOT_FOUND" -> false;
            default -> true;
        };
    }

    private static String safeMessage(Exception exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "Image processing failed" : message.substring(0, Math.min(500, message.length()));
    }
}
