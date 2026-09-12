package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.*;
import cn.vie.vibe.gallery.domain.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;

import java.io.IOException;
import java.net.URI;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api")
public class PhotoController {
    private static final Logger log = LoggerFactory.getLogger(PhotoController.class);
    private final PhotoFacade facade;
    private final StorageObjectRepository objects;
    private final ObjectStoragePort storage;
    private final TenantContextResolver context;
    private final GalleryMetrics metrics;

    public PhotoController(PhotoFacade facade, StorageObjectRepository objects, ObjectStoragePort storage, TenantContextResolver context) {
        this(facade, objects, storage, context, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public PhotoController(PhotoFacade facade, StorageObjectRepository objects, ObjectStoragePort storage,
                           TenantContextResolver context, GalleryMetrics metrics) {
        this.facade = facade;
        this.objects = objects;
        this.storage = storage;
        this.context = context;
        this.metrics = metrics;
    }

    @PostMapping(value = "/galleries/{galleryId}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<UploadResponse> upload(@PathVariable UUID galleryId,
                                                  @RequestParam("files") List<MultipartFile> files,
                                                  @RequestHeader(value = "X-Client-Batch-Id", required = false) String clientBatchId,
                                                  @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
                                                  HttpServletRequest request) throws IOException {
        if (files == null || files.isEmpty() || files.size() > 50) {
            throw new DomainException("FILE_INVALID", "At least one and at most 50 files are required");
        }
        String batchId = clientBatchId == null || clientBatchId.isBlank() ? UUID.randomUUID().toString() : clientBatchId;
        String requestId = (String) request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
        List<UploadItem> items = new ArrayList<>();
        int acceptedCount = 0;
        int rejectedCount = 0;
        for (int index = 0; index < files.size(); index++) {
            MultipartFile file = files.get(index);
            try {
                String itemKey = idempotencyKey == null || idempotencyKey.isBlank()
                        ? null
                        : idempotencyKey.trim() + ":" + index;
                PhotoFacade.UploadResult result = facade.upload(galleryId,
                        new PhotoUpload(file.getOriginalFilename(), file.getContentType(), file.getSize(), file.getInputStream()),
                        batchId, itemKey, requestId);
                items.add(UploadItem.accepted(file.getOriginalFilename(), result));
                acceptedCount++;
                log.info("gallery_upload_accepted requestId={} galleryId={} batchId={} photoId={} taskId={} filename={}",
                        requestId, galleryId, batchId, result.photoId(), result.taskId(), file.getOriginalFilename());
            } catch (DomainException exception) {
                items.add(UploadItem.rejected(file.getOriginalFilename(), exception.code(), exception.getMessage()));
                rejectedCount++;
                log.warn("gallery_upload_rejected requestId={} galleryId={} batchId={} filename={} errorCode={}",
                        requestId, galleryId, batchId, file.getOriginalFilename(), exception.code());
            } catch (IOException exception) {
                items.add(UploadItem.rejected(file.getOriginalFilename(), "FILE_INVALID", "Unable to read file"));
                rejectedCount++;
                log.warn("gallery_upload_rejected requestId={} galleryId={} batchId={} filename={} errorCode=FILE_INVALID",
                        requestId, galleryId, batchId, file.getOriginalFilename());
            }
        }
        if (metrics != null) {
            metrics.recordUploadAccepted(acceptedCount);
            metrics.recordUploadRejected(rejectedCount);
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(new UploadResponse(batchId, items));
    }

    @GetMapping("/galleries/{galleryId}/photos")
    public List<PhotoResponse> list(@PathVariable UUID galleryId) {
        UUID tenant = context.requireContext().tenantId();
        return facade.list(galleryId).stream().map(photo -> {
            var object = objects.findById(tenant, photo.storageObjectId()).orElse(null);
            String url = object != null && object.thumbnailKey() != null && object.status() == StorageObjectStatus.READY
                    ? storage.createReadUrl(object.thumbnailKey(), ObjectStoragePort.DEFAULT_READ_URL_TTL).toString() : null;
            return PhotoResponse.from(photo, object, url);
        }).toList();
    }

    @PatchMapping("/photos/{photoId}")
    public PhotoResponse update(@PathVariable UUID photoId, @RequestBody UpdateRequest request) {
        return PhotoResponse.from(facade.update(photoId, request.title(), request.sortOrder(), request.cover()), null, null);
    }

    @DeleteMapping("/photos/{photoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID photoId) { facade.delete(photoId); }

    public record UploadResponse(String batchId, List<UploadItem> items) {}
    public record UploadItem(String filename, boolean accepted, UUID photoId, UUID taskId, TaskStatus status, UploadError error) {
        static UploadItem accepted(String filename, PhotoFacade.UploadResult result) {
            return new UploadItem(filename, true, result.photoId(), result.taskId(), result.taskStatus(), null);
        }
        static UploadItem rejected(String filename, String code, String message) {
            return new UploadItem(filename, false, null, null, null, new UploadError(code, message));
        }
    }
    public record UploadError(String code, String message) {}
    public record UpdateRequest(String title, Integer sortOrder, Boolean cover) {}
    public record PhotoResponse(String id, String galleryId, String title, int sortOrder, boolean cover, PhotoStatus status,
                                Instant createdAt, long byteSize, Integer width, Integer height, String thumbnailUrl) {
        static PhotoResponse from(Photo photo, StorageObject object, String url) {
            return new PhotoResponse(photo.id().toString(), photo.galleryId().toString(), photo.title(), photo.sortOrder(), photo.cover(),
                    photo.status(), photo.createdAt(), object == null ? 0 : object.byteSize(), object == null ? null : object.width(),
                    object == null ? null : object.height(), url);
        }
    }
}
