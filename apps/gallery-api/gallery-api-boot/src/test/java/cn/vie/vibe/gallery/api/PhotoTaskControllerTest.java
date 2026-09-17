package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.PhotoProcessingTaskRepository;
import cn.vie.vibe.gallery.application.PhotoRepository;
import cn.vie.vibe.gallery.application.TenantContextResolver;
import cn.vie.vibe.gallery.application.WorkspaceAuthorizationPolicy;
import cn.vie.vibe.gallery.domain.MembershipRole;
import cn.vie.vibe.gallery.domain.PhotoProcessingTask;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import cn.vie.vibe.gallery.domain.TaskStatus;
import cn.vie.vibe.gallery.domain.TenantContext;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PhotoTaskControllerTest {

    @Test
    void retryResetsPhotoStatusToProcessing() {
        UUID tenantId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        UUID photoId = UUID.randomUUID();
        Instant now = Instant.parse("2026-09-10T12:00:00Z");

        PhotoProcessingTask failed = new PhotoProcessingTask(
                taskId, tenantId, UUID.randomUUID(), photoId, "shot.jpg",
                TaskStatus.FAILED, 0, "THUMBNAIL", 1, 3,
                "THUMBNAIL_PROCESSING_FAILED", "decode failed", "req-1",
                null, null, null, null, null, now, null, null, null, now.minusSeconds(60), now
        );
        PhotoProcessingTask queued = failed.withStatus(TaskStatus.QUEUED, now);

        PhotoProcessingTaskRepository tasks = mock(PhotoProcessingTaskRepository.class);
        PhotoRepository photos = mock(PhotoRepository.class);
        TenantContextResolver context = () -> new TenantContext(UUID.randomUUID(), tenantId, MembershipRole.OWNER);
        WorkspaceAuthorizationPolicy authorization = new WorkspaceAuthorizationPolicy(context);

        when(tasks.findById(tenantId, taskId)).thenReturn(Optional.of(failed), Optional.of(queued));
        when(tasks.retry(eq(tenantId), eq(taskId), any(), any())).thenReturn(1);
        when(photos.updateStatus(tenantId, photoId, PhotoStatus.PROCESSING)).thenReturn(1);

        PhotoTaskController controller = new PhotoTaskController(tasks, context, authorization, photos, null, null);
        PhotoTaskController.TaskResponse response = controller.retry(taskId);

        assertEquals(taskId, response.id());
        assertEquals(TaskStatus.QUEUED, response.status());
        verify(photos).updateStatus(tenantId, photoId, PhotoStatus.PROCESSING);
    }
}
