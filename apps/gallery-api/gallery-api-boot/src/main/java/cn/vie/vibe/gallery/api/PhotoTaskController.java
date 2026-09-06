package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.*;
import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.PhotoProcessingTask;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import cn.vie.vibe.gallery.domain.TaskStatus;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class PhotoTaskController {
    private final PhotoProcessingTaskRepository tasks;
    private final TenantContextResolver context;
    private final WorkspaceAuthorizationPolicy authorization;
    private final PhotoRepository photos;
    private final StorageObjectRepository objects;
    private final TenantQuotaRepository quotas;

    public PhotoTaskController(PhotoProcessingTaskRepository tasks, TenantContextResolver context,
                               WorkspaceAuthorizationPolicy authorization) {
        this(tasks, context, authorization, null, null, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public PhotoTaskController(PhotoProcessingTaskRepository tasks, TenantContextResolver context,
                               WorkspaceAuthorizationPolicy authorization, PhotoRepository photos,
                               StorageObjectRepository objects, TenantQuotaRepository quotas) {
        this.tasks = tasks;
        this.context = context;
        this.authorization = authorization;
        this.photos = photos;
        this.objects = objects;
        this.quotas = quotas;
    }

    @GetMapping("/galleries/{galleryId}/photo-tasks")
    public TaskPageResponse list(@PathVariable UUID galleryId,
                                 @RequestParam(required = false) String status,
                                 @RequestParam(defaultValue = "0") int page,
                                 @RequestParam(defaultValue = "20") int pageSize) {
        if (page < 0) throw new DomainException("INVALID_PAGE", "Page must not be negative");
        if (pageSize < 1 || pageSize > 100) throw new DomainException("INVALID_PAGE_SIZE", "Page size must be between 1 and 100");
        var tenant = authorization.requireEditor().tenantId();
        TaskFilter filter = new TaskFilter(parseStatuses(status));
        int offset = page * pageSize;
        List<PhotoProcessingTask> items = tasks.findByGallery(tenant, galleryId, filter, offset, pageSize);
        return new TaskPageResponse(items.stream().map(TaskResponse::from).toList(), page, pageSize,
                tasks.countByGallery(tenant, galleryId, filter), SummaryResponse.from(tasks.summaryByGallery(tenant, galleryId)));
    }

    @GetMapping("/photos/tasks/{taskId}")
    public TaskResponse get(@PathVariable UUID taskId) {
        var tenant = authorization.requireEditor().tenantId();
        PhotoProcessingTask task = tasks.findById(tenant, taskId)
                .orElseThrow(() -> new DomainException("TASK_NOT_FOUND", "Task not found"));
        return TaskResponse.from(task);
    }

    @PostMapping("/photos/tasks/{taskId}/retry")
    public TaskResponse retry(@PathVariable UUID taskId) {
        var tenant = authorization.requireEditor().tenantId();
        PhotoProcessingTask task = tasks.findById(tenant, taskId)
                .orElseThrow(() -> new DomainException("TASK_NOT_FOUND", "Task not found"));
        if (task.status() != TaskStatus.FAILED) throw new DomainException("TASK_STATE_CONFLICT", "Only failed tasks can be retried");
        if (!task.retryable()) throw new DomainException("TASK_RETRY_EXHAUSTED", "Task retry limit has been exhausted");
        if (tasks.retry(tenant, taskId, Instant.now(), Instant.now()) == 0) {
            throw new DomainException("TASK_STATE_CONFLICT", "Task changed before it could be retried");
        }
        return tasks.findById(tenant, taskId).map(TaskResponse::from).orElseThrow(() -> new DomainException("TASK_NOT_FOUND", "Task not found"));
    }

    @PostMapping("/photos/tasks/{taskId}/cancel")
    public TaskResponse cancel(@PathVariable UUID taskId) {
        var tenant = authorization.requireEditor().tenantId();
        PhotoProcessingTask task = tasks.findById(tenant, taskId)
                .orElseThrow(() -> new DomainException("TASK_NOT_FOUND", "Task not found"));
        Instant now = Instant.now();
        int changed = switch (task.status()) {
            case QUEUED, PENDING -> tasks.cancelQueued(tenant, taskId, now);
            case PROCESSING -> tasks.requestCancel(tenant, taskId, now);
            case CANCEL_REQUESTED -> 1;
            default -> throw new DomainException("TASK_STATE_CONFLICT", "Task can no longer be cancelled");
        };
        if (changed == 0) throw new DomainException("TASK_STATE_CONFLICT", "Task changed before it could be cancelled");
        if (task.status() == TaskStatus.QUEUED || task.status() == TaskStatus.PENDING) {
            cleanupCancelled(tenant, task);
        }
        return tasks.findById(tenant, taskId).map(TaskResponse::from).orElseThrow(() -> new DomainException("TASK_NOT_FOUND", "Task not found"));
    }

    private void cleanupCancelled(UUID tenant, PhotoProcessingTask task) {
        if (photos == null || objects == null || quotas == null) return;
        photos.findById(tenant, task.photoId()).ifPresent(photo -> objects.findById(tenant, photo.storageObjectId()).ifPresent(object -> {
            objects.softDelete(tenant, object.id());
            quotas.release(tenant, object.byteSize(), 1);
            photos.updateStatus(tenant, photo.id(), PhotoStatus.CANCELLED);
        }));
    }

    private static EnumSet<TaskStatus> parseStatuses(String value) {
        if (value == null || value.isBlank()) return EnumSet.allOf(TaskStatus.class);
        EnumSet<TaskStatus> statuses = EnumSet.noneOf(TaskStatus.class);
        Arrays.stream(value.split(",")).map(String::trim).filter(s -> !s.isBlank()).forEach(raw -> {
            try {
                statuses.add(TaskStatus.valueOf(raw.toUpperCase()));
            } catch (IllegalArgumentException e) {
                throw new DomainException("INVALID_PARAMETER", "Task status is invalid");
            }
        });
        return statuses;
    }

    public record TaskPageResponse(List<TaskResponse> items, int page, int pageSize, long total, SummaryResponse summary) {}
    public record SummaryResponse(long queued, long processing, long succeeded, long failed, long cancelled) {
        static SummaryResponse from(TaskSummary summary) { return new SummaryResponse(summary.queued(), summary.processing(), summary.succeeded(), summary.failed(), summary.cancelled()); }
    }
    public record TaskResponse(UUID id, UUID galleryId, UUID photoId, String filename, TaskStatus status, int progress,
                               String stage, int attempts, int maxAttempts, boolean retryable, TaskError error,
                               String requestId, Instant createdAt, Instant startedAt, Instant updatedAt, Instant finishedAt) {
        static TaskResponse from(PhotoProcessingTask task) {
            TaskError error = task.errorCode() == null && task.errorMessage() == null ? null : new TaskError(task.errorCode(), task.errorMessage());
            return new TaskResponse(task.id(), task.galleryId(), task.photoId(), task.filename(), task.status(), task.progress(),
                    task.stage(), task.attempts(), task.maxAttempts(), task.retryable(), error, task.requestId(), task.createdAt(),
                    task.startedAt(), task.updatedAt(), task.finishedAt());
        }
    }
    public record TaskError(String code, String message) {}
}
