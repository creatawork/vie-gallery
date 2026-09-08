package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.Photo;
import cn.vie.vibe.gallery.domain.PhotoAssetVariant;
import cn.vie.vibe.gallery.domain.PhotoProcessingTask;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import cn.vie.vibe.gallery.domain.StorageObject;
import cn.vie.vibe.gallery.domain.TaskStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
public class PhotoProcessingWorker implements DisposableBean {
    private static final Logger log = LoggerFactory.getLogger(PhotoProcessingWorker.class);
    private final PhotoProcessingTaskRepository tasks;
    private final PhotoRepository photos;
    private final StorageObjectRepository objects;
    private final ObjectStoragePort storage;
    private final ThumbnailProcessor thumbnails;
    private final TenantQuotaRepository quotas;
    private final ImageVariantProcessor variants;
    private final PhotoAssetVariantRepository assetVariants;
    private final GalleryTexturePolicy texturePolicy;
    private final String workerId = "gallery-worker-" + UUID.randomUUID();
    private final int maxAttempts;
    private final Duration staleAfter;
    private final ScheduledExecutorService leaseScheduler = Executors.newScheduledThreadPool(2, runnable -> {
        Thread thread = new Thread(runnable, "gallery-task-lease");
        thread.setDaemon(true);
        return thread;
    });

    public PhotoProcessingWorker(PhotoProcessingTaskRepository tasks, PhotoRepository photos, StorageObjectRepository objects,
                                 ObjectStoragePort storage, ThumbnailProcessor thumbnails) {
        this(tasks, photos, objects, storage, thumbnails, null, null, null, null, 3, Duration.ofMinutes(10));
    }

    @org.springframework.beans.factory.annotation.Autowired
    public PhotoProcessingWorker(PhotoProcessingTaskRepository tasks, PhotoRepository photos, StorageObjectRepository objects,
                                 ObjectStoragePort storage, ThumbnailProcessor thumbnails, TenantQuotaRepository quotas,
                                 ImageVariantProcessor variants, PhotoAssetVariantRepository assetVariants,
                                 GalleryTexturePolicy texturePolicy,
                                 @Value("${gallery.processing.max-retries:3}") int maxRetries,
                                 @Value("${gallery.processing.stale-after:PT10M}") Duration staleAfter) {
        this.tasks = tasks;
        this.photos = photos;
        this.objects = objects;
        this.storage = storage;
        this.thumbnails = thumbnails;
        this.quotas = quotas;
        this.variants = variants;
        this.assetVariants = assetVariants;
        this.texturePolicy = texturePolicy;
        this.maxAttempts = Math.max(1, maxRetries);
        this.staleAfter = staleAfter == null || staleAfter.isNegative() || staleAfter.isZero()
                ? Duration.ofMinutes(10) : staleAfter;
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
        AtomicBoolean leaseLost = new AtomicBoolean(false);
        long leaseIntervalMillis = Math.max(1000L, Math.min(30_000L, staleAfter.toMillis() / 3));
        ScheduledFuture<?> lease = leaseScheduler.scheduleAtFixedRate(() -> {
            try {
                if (tasks.heartbeat(task.tenantId(), task.id(), workerId, Instant.now()) == 0) leaseLost.set(true);
            } catch (RuntimeException exception) {
                leaseLost.set(true);
                log.warn("gallery_task_lease_failed taskId={} workerId={}", task.id(), workerId, exception);
            }
        }, leaseIntervalMillis, leaseIntervalMillis, TimeUnit.MILLISECONDS);
        try {
            if (isCancellationRequested(task)) {
                cancel(task);
                return;
            }
            requireLease(task, leaseLost);
            tasks.progress(task.tenantId(), task.id(), workerId, 10, "VALIDATE", Instant.now());
            requireLease(task, leaseLost);
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
                requireLease(task, leaseLost);
                String key = "tenant/" + task.tenantId() + "/photos/" + task.photoId() + "/thumbnail";
                requireLease(task, leaseLost);
                storage.put(key, new ByteArrayInputStream(result.content()), result.contentType(), result.content().length);
                requireLease(task, leaseLost);
                if (variants != null && assetVariants != null) {
                    PhotoAssetVariant high = PhotoAssetVariant.ready(task.tenantId(), task.photoId(), object.id(),
                            cn.vie.vibe.gallery.domain.VariantKind.HIGH, key, result.contentType(), result.content().length,
                            result.width(), result.height(), null);
                    assetVariants.upsert(high);
                }
                tasks.progress(task.tenantId(), task.id(), workerId, 60, "TEXTURE", Instant.now());
                requireLease(task, leaseLost);
                if (texturePolicy != null && texturePolicy.shouldGenerate(task.tenantId(), task.galleryId())) {
                    try (InputStream textureIn = storage.get(object.objectKey())) {
                        ImageVariantProcessor.VariantResult texture = variants.create(
                                object.mimeType(), textureIn, ImageVariantProcessor.VariantSpec.texture());
                        String textureKey = "tenant/" + task.tenantId() + "/photos/" + task.photoId() + "/texture";
                        storage.put(textureKey, new ByteArrayInputStream(texture.content()), texture.contentType(), texture.content().length);
                        if (assetVariants != null) {
                            assetVariants.upsert(PhotoAssetVariant.ready(task.tenantId(), task.photoId(), object.id(),
                                    cn.vie.vibe.gallery.domain.VariantKind.TEXTURE, textureKey, texture.contentType(), texture.content().length,
                                    texture.width(), texture.height(), null));
                        }
                    }
                }
                tasks.progress(task.tenantId(), task.id(), workerId, 80, "FINALIZE", Instant.now());
                requireLease(task, leaseLost);
                if (objects.markReady(task.tenantId(), object.id(), key, result.width(), result.height()) == 0) {
                    throw new DomainException("STORAGE_UNAVAILABLE", "Unable to finalize thumbnail metadata");
                }
                requireLease(task, leaseLost);
                if (photos.updateStatus(task.tenantId(), task.photoId(), PhotoStatus.READY) == 0) {
                    throw new DomainException("PHOTO_NOT_FOUND", "Photo is no longer available");
                }
                requireLease(task, leaseLost);
                if (tasks.complete(task.tenantId(), task.id(), workerId, Instant.now()) == 0) {
                    throw new LeaseLostException();
                }
                log.info("gallery_task_transition taskId={} photoId={} tenantId={} workerId={} attempt={} stage={} fromStatus={} toStatus={} durationMs={}",
                        task.id(), task.photoId(), task.tenantId(), workerId, task.attempts(), "FINALIZE", TaskStatus.PROCESSING, TaskStatus.SUCCEEDED,
                        Duration.between(started, Instant.now()).toMillis());
            }
        } catch (Exception exception) {
            if (!(exception instanceof LeaseLostException)) handleFailure(task, objectId, exception, started);
        } finally {
            lease.cancel(true);
        }
    }

    private void requireLease(PhotoProcessingTask task, AtomicBoolean leaseLost) {
        if (leaseLost.get() || tasks.heartbeat(task.tenantId(), task.id(), workerId, Instant.now()) == 0) {
            leaseLost.set(true);
            throw new LeaseLostException();
        }
    }

    @Override
    public void destroy() {
        leaseScheduler.shutdownNow();
    }

    private static final class LeaseLostException extends RuntimeException {
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
                if (quotas != null) quotas.releaseOnce(task.tenantId(), "PHOTO", photo.id(), object.byteSize(), 1);
            });
        });
        log.info("gallery_task_transition taskId={} photoId={} tenantId={} workerId={} fromStatus={} toStatus={}",
                task.id(), task.photoId(), task.tenantId(), workerId, TaskStatus.CANCEL_REQUESTED, TaskStatus.CANCELLED);
    }

    private void handleFailure(PhotoProcessingTask task, UUID objectId, Exception exception, Instant started) {
        String code = errorCode(exception);
        boolean retryable = isRetryable(code);
        boolean terminal = !retryable || task.attempts() >= task.maxAttempts();
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
