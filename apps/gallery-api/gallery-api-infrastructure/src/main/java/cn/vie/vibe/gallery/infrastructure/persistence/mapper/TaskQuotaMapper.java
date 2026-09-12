package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface TaskQuotaMapper {
    String TASK_COLUMNS = "BIN_TO_UUID(t.id) id,BIN_TO_UUID(t.tenant_id) tenantId,BIN_TO_UUID(t.gallery_id) galleryId," +
            "BIN_TO_UUID(t.photo_id) photoId,t.filename,t.status,t.progress,t.stage,t.attempts,t.max_attempts maxAttempts," +
            "t.last_error_code errorCode,t.last_error_message errorMessage,t.last_request_id requestId,t.worker_id workerId," +
            "t.next_attempt_at nextAttemptAt,t.locked_at lockedAt,t.heartbeat_at heartbeatAt,t.started_at startedAt," +
            "t.finished_at finishedAt,t.cancelled_at cancelledAt,t.client_batch_id clientBatchId,t.idempotency_key idempotencyKey," +
            "t.created_at createdAt,t.updated_at updatedAt";

    @Insert("INSERT INTO photo_processing_task(id,tenant_id,gallery_id,photo_id,filename,status,progress,stage,attempts,max_attempts," +
            "next_attempt_at,last_error_code,last_error_message,last_request_id,worker_id,heartbeat_at,started_at,finished_at," +
            "cancelled_at,client_batch_id,idempotency_key,created_at,updated_at) VALUES(" +
            "UUID_TO_BIN(#{id}),UUID_TO_BIN(#{tenant}),UUID_TO_BIN(#{gallery}),UUID_TO_BIN(#{photo}),#{filename},#{status},#{progress},#{stage},#{attempts},#{maxAttempts}," +
            "#{nextAttemptAt},#{errorCode},#{errorMessage},#{requestId},#{workerId},#{heartbeatAt},#{startedAt},#{finishedAt},#{cancelledAt},#{clientBatchId},#{idempotencyKey},#{createdAt},#{updatedAt})")
    int task(@Param("id") String id, @Param("tenant") String tenant, @Param("gallery") String gallery,
             @Param("photo") String photo, @Param("filename") String filename, @Param("status") String status,
             @Param("progress") int progress, @Param("stage") String stage, @Param("attempts") int attempts,
             @Param("maxAttempts") int maxAttempts, @Param("nextAttemptAt") LocalDateTime nextAttemptAt,
             @Param("errorCode") String errorCode, @Param("errorMessage") String errorMessage,
             @Param("requestId") String requestId, @Param("workerId") String workerId,
             @Param("heartbeatAt") LocalDateTime heartbeatAt, @Param("startedAt") LocalDateTime startedAt,
             @Param("finishedAt") LocalDateTime finishedAt, @Param("cancelledAt") LocalDateTime cancelledAt,
             @Param("clientBatchId") String clientBatchId, @Param("idempotencyKey") String idempotencyKey,
             @Param("createdAt") LocalDateTime createdAt, @Param("updatedAt") LocalDateTime updatedAt);

    @Select("SELECT " + TASK_COLUMNS + " FROM photo_processing_task t WHERE t.tenant_id=UUID_TO_BIN(#{tenant}) AND t.id=UUID_TO_BIN(#{id})")
    Map<String, Object> taskById(@Param("tenant") String tenant, @Param("id") String id);

    @Select("SELECT " + TASK_COLUMNS + " FROM photo_processing_task t WHERE t.tenant_id=UUID_TO_BIN(#{tenant}) AND t.idempotency_key=#{key} LIMIT 1")
    Map<String, Object> taskByIdempotencyKey(@Param("tenant") String tenant, @Param("key") String key);

    @Select("<script>SELECT " + TASK_COLUMNS + " FROM photo_processing_task t WHERE t.tenant_id=UUID_TO_BIN(#{tenant}) AND t.gallery_id=UUID_TO_BIN(#{gallery}) " +
            "<if test='statuses != null and statuses.size() > 0'>AND t.status IN <foreach collection='statuses' item='status' open='(' separator=',' close=')'>#{status}</foreach></if> " +
            "ORDER BY t.created_at DESC,t.id DESC LIMIT #{limit} OFFSET #{offset}</script>")
    List<Map<String, Object>> tasksByGallery(@Param("tenant") String tenant, @Param("gallery") String gallery,
                                              @Param("statuses") List<String> statuses, @Param("offset") long offset,
                                              @Param("limit") int limit);

    @Select("<script>SELECT COUNT(*) FROM photo_processing_task WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND gallery_id=UUID_TO_BIN(#{gallery}) " +
            "<if test='statuses != null and statuses.size() > 0'>AND status IN <foreach collection='statuses' item='status' open='(' separator=',' close=')'>#{status}</foreach></if></script>")
    long countTasks(@Param("tenant") String tenant, @Param("gallery") String gallery, @Param("statuses") List<String> statuses);

    @Select("SELECT status,COUNT(*) count FROM photo_processing_task WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND gallery_id=UUID_TO_BIN(#{gallery}) GROUP BY status")
    List<Map<String, Object>> summary(@Param("tenant") String tenant, @Param("gallery") String gallery);

    @Select("SELECT COUNT(*) FROM photo_processing_task WHERE status IN ('QUEUED','PENDING','PROCESSING')")
    long countActiveQueue();

    @Select("SELECT " + TASK_COLUMNS + " FROM photo_processing_task t WHERE t.status='QUEUED' AND (t.next_attempt_at IS NULL OR t.next_attempt_at<=#{now}) ORDER BY t.created_at,t.id LIMIT 1")
    Map<String, Object> nextTask(@Param("now") LocalDateTime now);

    @Update("UPDATE photo_processing_task SET status='PROCESSING',worker_id=#{worker},locked_at=#{now},heartbeat_at=#{now},started_at=COALESCE(started_at,#{now}),attempts=attempts+1,updated_at=#{now} WHERE id=UUID_TO_BIN(#{id}) AND status='QUEUED' AND attempts<max_attempts AND (next_attempt_at IS NULL OR next_attempt_at<=#{now})")
    int claim(@Param("id") String id, @Param("worker") String worker, @Param("now") LocalDateTime now);

    @Update("UPDATE photo_processing_task SET heartbeat_at=#{now},locked_at=#{now},updated_at=#{now} WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND id=UUID_TO_BIN(#{id}) AND status='PROCESSING' AND worker_id=#{worker}")
    int heartbeat(@Param("tenant") String tenant, @Param("id") String id, @Param("worker") String worker, @Param("now") LocalDateTime now);

    @Update("UPDATE photo_processing_task SET progress=GREATEST(progress,LEAST(100,#{progress})),stage=#{stage},heartbeat_at=#{now},locked_at=#{now},updated_at=#{now} WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND id=UUID_TO_BIN(#{id}) AND status='PROCESSING' AND worker_id=#{worker}")
    int progress(@Param("tenant") String tenant, @Param("id") String id, @Param("worker") String worker, @Param("progress") int progress, @Param("stage") String stage, @Param("now") LocalDateTime now);

    @Update("UPDATE photo_processing_task SET status='CANCELLED',cancelled_at=#{now},finished_at=#{now},worker_id=NULL,heartbeat_at=NULL,updated_at=#{now} WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND id=UUID_TO_BIN(#{id}) AND status='CANCEL_REQUESTED' AND worker_id=#{worker}")
    int cancelProcessing(@Param("tenant") String tenant, @Param("id") String id, @Param("worker") String worker, @Param("now") LocalDateTime now);

    @Update("UPDATE photo_processing_task SET status='SUCCEEDED',progress=100,stage='FINALIZE',finished_at=#{now},heartbeat_at=NULL,worker_id=NULL,updated_at=#{now} WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND id=UUID_TO_BIN(#{id}) AND status='PROCESSING' AND worker_id=#{worker}")
    int succeed(@Param("tenant") String tenant, @Param("id") String id, @Param("worker") String worker, @Param("now") LocalDateTime now);

    @Update("UPDATE photo_processing_task SET status=CASE WHEN #{terminal}=1 THEN 'FAILED' ELSE 'QUEUED' END,next_attempt_at=#{nextAttemptAt},last_error_code=#{errorCode},last_error_message=#{errorMessage},last_request_id=#{requestId},heartbeat_at=NULL,worker_id=NULL,finished_at=CASE WHEN #{terminal}=1 THEN #{now} ELSE NULL END,updated_at=#{now} WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND id=UUID_TO_BIN(#{id}) AND status IN ('PROCESSING','CANCEL_REQUESTED') AND worker_id=#{worker}")
    int fail(@Param("tenant") String tenant, @Param("id") String id, @Param("worker") String worker,
             @Param("errorCode") String errorCode, @Param("errorMessage") String errorMessage, @Param("requestId") String requestId,
             @Param("terminal") boolean terminal, @Param("nextAttemptAt") LocalDateTime nextAttemptAt, @Param("now") LocalDateTime now);

    @Update("UPDATE photo_processing_task SET status='QUEUED',next_attempt_at=#{nextAttemptAt},last_error_code=NULL,last_error_message=NULL,last_request_id=NULL,finished_at=NULL,updated_at=#{now} WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND id=UUID_TO_BIN(#{id}) AND status='FAILED' AND attempts<max_attempts")
    int retry(@Param("tenant") String tenant, @Param("id") String id, @Param("nextAttemptAt") LocalDateTime nextAttemptAt, @Param("now") LocalDateTime now);

    @Update("UPDATE photo_processing_task SET status='CANCEL_REQUESTED',updated_at=#{now} WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND id=UUID_TO_BIN(#{id}) AND status='PROCESSING'")
    int requestCancel(@Param("tenant") String tenant, @Param("id") String id, @Param("now") LocalDateTime now);

    @Update("UPDATE photo_processing_task SET status='CANCELLED',cancelled_at=#{now},finished_at=#{now},updated_at=#{now} WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND id=UUID_TO_BIN(#{id}) AND status='QUEUED'")
    int cancelQueued(@Param("tenant") String tenant, @Param("id") String id, @Param("now") LocalDateTime now);

    @Update("UPDATE photo_processing_task SET status=CASE WHEN attempts>=max_attempts THEN 'FAILED' ELSE 'QUEUED' END,worker_id=NULL,locked_at=NULL,heartbeat_at=NULL,next_attempt_at=CASE WHEN attempts>=max_attempts THEN NULL ELSE #{now} END,finished_at=CASE WHEN attempts>=max_attempts THEN #{now} ELSE NULL END,last_error_code=CASE WHEN attempts>=max_attempts THEN 'WORKER_LEASE_EXPIRED' ELSE last_error_code END,last_error_message=CASE WHEN attempts>=max_attempts THEN 'Worker lease expired' ELSE last_error_message END,updated_at=#{now} WHERE status='PROCESSING' AND (heartbeat_at IS NULL OR heartbeat_at<#{threshold})")
    int recoverStale(@Param("threshold") LocalDateTime threshold, @Param("now") LocalDateTime now);

    @Insert("INSERT INTO tenant_quota(tenant_id,max_bytes,max_photos) VALUES(UUID_TO_BIN(#{tenant}),#{maxBytes},#{maxPhotos}) ON DUPLICATE KEY UPDATE tenant_id=tenant_id")
    int ensure(@Param("tenant") String tenant, @Param("maxBytes") long bytes, @Param("maxPhotos") long photos);
    @Select("SELECT BIN_TO_UUID(tenant_id) tenantId,max_bytes maxBytes,used_bytes usedBytes,max_photos maxPhotos,photo_count photoCount FROM tenant_quota WHERE tenant_id=UUID_TO_BIN(#{tenant}) FOR UPDATE")
    Map<String, Object> quota(@Param("tenant") String tenant);
    @Update("UPDATE tenant_quota SET used_bytes=used_bytes+#{bytes},photo_count=photo_count+#{photos} WHERE tenant_id=UUID_TO_BIN(#{tenant}) AND used_bytes+#{bytes}<=max_bytes AND photo_count+#{photos}<=max_photos")
    int reserve(@Param("tenant") String tenant, @Param("bytes") long bytes, @Param("photos") long photos);
    @Update("UPDATE tenant_quota SET used_bytes=GREATEST(0,used_bytes-#{bytes}),photo_count=GREATEST(0,photo_count-#{photos}) WHERE tenant_id=UUID_TO_BIN(#{tenant})")
    int release(@Param("tenant") String tenant, @Param("bytes") long bytes, @Param("photos") long photos);
}
