package cn.vie.vibe.gallery.application;
import cn.vie.vibe.gallery.domain.PhotoProcessingTask;
import java.util.Optional;
import java.util.UUID;
public interface PhotoProcessingTaskRepository {
    PhotoProcessingTask save(PhotoProcessingTask task);
    Optional<PhotoProcessingTask> findById(UUID tenantId, UUID taskId);
    Optional<PhotoProcessingTask> claimNext();
    int succeed(UUID taskId);
    int fail(UUID taskId, String errorMessage, boolean terminal);
}
