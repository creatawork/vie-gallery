package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.Photo;
import cn.vie.vibe.gallery.domain.PhotoProcessingTask;
import cn.vie.vibe.gallery.domain.PhotoStatus;
import cn.vie.vibe.gallery.domain.StorageObject;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.UUID;

@Component
public class PhotoProcessingWorker {
    private final PhotoProcessingTaskRepository tasks;
    private final PhotoRepository photos;
    private final StorageObjectRepository objects;
    private final ObjectStoragePort storage;
    private final ThumbnailProcessor thumbnails;

    public PhotoProcessingWorker(
            PhotoProcessingTaskRepository tasks,
            PhotoRepository photos,
            StorageObjectRepository objects,
            ObjectStoragePort storage,
            ThumbnailProcessor thumbnails
    ) {
        this.tasks = tasks;
        this.photos = photos;
        this.objects = objects;
        this.storage = storage;
        this.thumbnails = thumbnails;
    }

    @Scheduled(fixedDelayString = "${gallery.processing.poll-interval:5000}")
    public void processOne() {
        tasks.claimNext().ifPresent(this::process);
    }

    private void process(PhotoProcessingTask task) {
        UUID objectId = null;
        try {
            Photo photo = photos.findById(task.tenantId(), task.photoId()).orElseThrow();
            objectId = photo.storageObjectId();
            StorageObject object = objects.findById(task.tenantId(), objectId).orElseThrow();
            try (InputStream in = storage.get(object.objectKey())) {
                ThumbnailProcessor.ThumbnailResult result = thumbnails.create(object.mimeType(), in);
                String key = "tenant/" + task.tenantId() + "/photos/" + task.photoId() + "/thumbnail";
                storage.put(key, new ByteArrayInputStream(result.content()), result.contentType(), result.content().length);
                objects.markReady(task.tenantId(), object.id(), key, result.width(), result.height());
                photos.updateStatus(task.tenantId(), task.photoId(), PhotoStatus.READY);
                tasks.succeed(task.id());
            }
        } catch (Exception exception) {
            if (objectId != null) {
                objects.markFailed(task.tenantId(), objectId);
            }
            photos.updateStatus(task.tenantId(), task.photoId(), PhotoStatus.FAILED);
            tasks.fail(task.id(), "Image processing failed", true);
        }
    }
}
