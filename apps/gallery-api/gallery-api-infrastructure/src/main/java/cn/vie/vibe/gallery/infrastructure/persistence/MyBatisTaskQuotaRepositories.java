package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.*;
import cn.vie.vibe.gallery.domain.*;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.TaskQuotaMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.*;

import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.*;

@Repository
class MyBatisTaskRepository implements PhotoProcessingTaskRepository {
    private final TaskQuotaMapper mapper;

    MyBatisTaskRepository(TaskQuotaMapper mapper) {
        this.mapper = mapper;
    }

    private PhotoProcessingTask map(Map<String, Object> row) {
        if (row == null) return null;
        return new PhotoProcessingTask(uuid(row, "id"), uuid(row, "tenantId"), uuid(row, "galleryId"), uuid(row, "photoId"),
                (String) row.getOrDefault("filename", ""), TaskStatus.valueOf((String) row.get("status")),
                number(row, "progress", 0), (String) row.getOrDefault("stage", "UPLOAD"), number(row, "attempts", 0),
                number(row, "maxAttempts", 3), (String) row.get("errorCode"), (String) row.get("errorMessage"),
                (String) row.get("requestId"), (String) row.get("workerId"), instant(row, "nextAttemptAt"),
                instant(row, "lockedAt"), instant(row, "heartbeatAt"), instant(row, "startedAt"), instant(row, "finishedAt"),
                instant(row, "cancelledAt"), (String) row.get("clientBatchId"), (String) row.get("idempotencyKey"),
                instant(row, "createdAt"), instant(row, "updatedAt"));
    }

    private static int number(Map<String, Object> row, String key, int fallback) {
        Object value = row.get(key);
        return value instanceof Number number ? number.intValue() : fallback;
    }

    @Override
    public PhotoProcessingTask save(PhotoProcessingTask task) {
        mapper.task(task.id().toString(), task.tenantId().toString(), task.galleryId().toString(), task.photoId().toString(),
                task.filename(), task.status().normalized().name(), task.progress(), task.stage(), task.attempts(), task.maxAttempts(),
                localDateTime(task.nextAttemptAt()), task.errorCode(), task.errorMessage(), task.requestId(), task.workerId(),
                localDateTime(task.heartbeatAt()), localDateTime(task.startedAt()), localDateTime(task.finishedAt()),
                localDateTime(task.cancelledAt()), task.clientBatchId(), task.idempotencyKey(), localDateTime(task.createdAt()), localDateTime(task.updatedAt()));
        return task;
    }

    @Override
    public Optional<PhotoProcessingTask> findById(UUID tenantId, UUID taskId) {
        return Optional.ofNullable(mapper.taskById(tenantId.toString(), taskId.toString())).map(this::map);
    }

    @Override
    public Optional<PhotoProcessingTask> findByTenantAndIdempotencyKey(UUID tenantId, String idempotencyKey) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) return Optional.empty();
        return Optional.ofNullable(mapper.taskByIdempotencyKey(tenantId.toString(), idempotencyKey)).map(this::map);
    }

    @Override
    public List<PhotoProcessingTask> findByGallery(UUID tenantId, UUID galleryId, TaskFilter filter, long offset, int limit) {
        List<String> statuses = normalizedStatuses(filter);
        return mapper.tasksByGallery(tenantId.toString(), galleryId.toString(), statuses, offset, limit).stream().map(this::map).toList();
    }

    @Override
    public long countByGallery(UUID tenantId, UUID galleryId, TaskFilter filter) {
        List<String> statuses = normalizedStatuses(filter);
        return mapper.countTasks(tenantId.toString(), galleryId.toString(), statuses);
    }

    private static List<String> normalizedStatuses(TaskFilter filter) {
        if (filter == null || filter.statuses().isEmpty()) return List.of();
        return filter.statuses().stream()
                .map(TaskStatus::normalized)
                .distinct()
                .map(TaskStatus::name)
                .toList();
    }

    @Override
    public TaskSummary summaryByGallery(UUID tenantId, UUID galleryId) {
        Map<TaskStatus, Long> counts = new EnumMap<>(TaskStatus.class);
        for (Map<String, Object> row : mapper.summary(tenantId.toString(), galleryId.toString())) {
            counts.put(TaskStatus.valueOf((String) row.get("status")), ((Number) row.get("count")).longValue());
        }
        return TaskSummary.of(counts);
    }

    @Override
    public Optional<PhotoProcessingTask> claimNext() {
        return claimNext(Instant.now(), "legacy-worker");
    }

    @Override
    public Optional<PhotoProcessingTask> claimNext(Instant now, String workerId) {
        Map<String, Object> row = mapper.nextTask(localDateTime(now));
        if (row == null || mapper.claim((String) row.get("id"), workerId, localDateTime(now)) != 1) return Optional.empty();
        return findById(uuid(row, "tenantId"), uuid(row, "id"));
    }

    @Override public int heartbeat(UUID tenantId, UUID taskId, String workerId, Instant now) {
        return mapper.heartbeat(tenantId.toString(), taskId.toString(), workerId, localDateTime(now));
    }
    @Override public int progress(UUID tenantId, UUID taskId, String workerId, int progress, String stage, Instant now) {
        return mapper.progress(tenantId.toString(), taskId.toString(), workerId, progress, stage, localDateTime(now));
    }
    @Override public int cancelProcessing(UUID tenantId, UUID taskId, String workerId, Instant now) {
        return mapper.cancelProcessing(tenantId.toString(), taskId.toString(), workerId, localDateTime(now));
    }
    @Override public int complete(UUID tenantId, UUID taskId, String workerId, Instant now) {
        return mapper.succeed(tenantId.toString(), taskId.toString(), workerId, localDateTime(now));
    }
    @Override public int fail(UUID tenantId, UUID taskId, String workerId, String code, String message, String requestId, boolean terminal, Instant nextAttemptAt, Instant now) {
        return mapper.fail(tenantId.toString(), taskId.toString(), workerId, code, message, requestId, terminal, localDateTime(nextAttemptAt), localDateTime(now));
    }
    @Override public int retry(UUID tenantId, UUID taskId, Instant nextAttemptAt, Instant now) {
        return mapper.retry(tenantId.toString(), taskId.toString(), localDateTime(nextAttemptAt), localDateTime(now));
    }
    @Override public int requestCancel(UUID tenantId, UUID taskId, Instant now) {
        return mapper.requestCancel(tenantId.toString(), taskId.toString(), localDateTime(now));
    }
    @Override public int cancelQueued(UUID tenantId, UUID taskId, Instant now) {
        return mapper.cancelQueued(tenantId.toString(), taskId.toString(), localDateTime(now));
    }
    @Override public int recoverStale(Instant threshold, Instant now) {
        return mapper.recoverStale(localDateTime(threshold), localDateTime(now));
    }
}

@Repository
class MyBatisQuotaRepository implements TenantQuotaRepository {
    private final TaskQuotaMapper mapper;
    MyBatisQuotaRepository(TaskQuotaMapper mapper) { this.mapper = mapper; }
    public TenantQuota findForUpdate(UUID tenantId) { Map<String,Object> row=mapper.quota(tenantId.toString()); return new TenantQuota(tenantId,((Number)row.get("maxBytes")).longValue(),((Number)row.get("usedBytes")).longValue(),((Number)row.get("maxPhotos")).longValue(),((Number)row.get("photoCount")).longValue()); }
    public void ensure(UUID tenantId,long bytes,long photos){mapper.ensure(tenantId.toString(),bytes,photos);}
    public void reserve(UUID tenantId,long bytes,long photos){if(mapper.reserve(tenantId.toString(),bytes,photos)==0)throw new DomainException("QUOTA_EXCEEDED","Quota exceeded");}
    public void release(UUID tenantId,long bytes,long photos){mapper.release(tenantId.toString(),bytes,photos);}
}
