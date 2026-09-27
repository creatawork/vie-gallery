package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;

@Service
public class PhotoFacade {
    private static final Set<String> TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    private final GalleryRepository galleries; private final PhotoRepository photos; private final StorageObjectRepository objects;
    private final PhotoProcessingTaskRepository tasks; private final TenantQuotaRepository quotas; private final ObjectStoragePort storage;
    private final TenantContextResolver context; private final WorkspaceAuthorizationPolicy authorization; private final long maxFileSize, maxPixels, maxBytes, maxPhotos;
    private final int maxAttempts;
    public PhotoFacade(GalleryRepository galleries, PhotoRepository photos, StorageObjectRepository objects, PhotoProcessingTaskRepository tasks,
                       TenantQuotaRepository quotas, ObjectStoragePort storage, TenantContextResolver context,
                       @Value("${gallery.quota.max-file-size:104857600}") long maxFileSize,
                       @Value("${gallery.quota.max-pixels:40000000}") long maxPixels,
                       @Value("${gallery.quota.max-bytes:5368709120}") long maxBytes,
                       @Value("${gallery.quota.max-photos:10000}") long maxPhotos) {
        this(galleries, photos, objects, tasks, quotas, storage, context, new WorkspaceAuthorizationPolicy(context),
                maxFileSize, maxPixels, maxBytes, maxPhotos, 3);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public PhotoFacade(GalleryRepository galleries, PhotoRepository photos, StorageObjectRepository objects, PhotoProcessingTaskRepository tasks,
                       TenantQuotaRepository quotas, ObjectStoragePort storage, TenantContextResolver context,
                       WorkspaceAuthorizationPolicy authorization,
                       @Value("${gallery.quota.max-file-size:104857600}") long maxFileSize,
                       @Value("${gallery.quota.max-pixels:40000000}") long maxPixels,
                       @Value("${gallery.quota.max-bytes:5368709120}") long maxBytes,
                       @Value("${gallery.quota.max-photos:10000}") long maxPhotos,
                       @Value("${gallery.processing.max-retries:3}") int maxAttempts) {
        this.galleries=galleries;this.photos=photos;this.objects=objects;this.tasks=tasks;this.quotas=quotas;this.storage=storage;this.context=context;this.authorization=authorization;
        this.maxFileSize=maxFileSize;this.maxPixels=maxPixels;this.maxBytes=maxBytes;this.maxPhotos=maxPhotos;this.maxAttempts=Math.max(1, maxAttempts);
    }
    @Transactional public UploadResult upload(UUID galleryId, PhotoUpload upload) {
        return upload(galleryId, upload, null, null);
    }

    @Transactional public UploadResult upload(UUID galleryId, PhotoUpload upload, String clientBatchId, String idempotencyKey) {
        return upload(galleryId, upload, clientBatchId, idempotencyKey, null);
    }

    @Transactional public UploadResult upload(UUID galleryId, PhotoUpload upload, String clientBatchId, String idempotencyKey, String requestId) {
        UUID tenant = authorization.requireEditor().tenantId();
        galleries.findById(tenant, galleryId).orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));
        if (upload == null || upload.size() <= 0) throw new DomainException("FILE_INVALID", "Empty file");
        if (upload.size() > maxFileSize) throw new DomainException("FILE_TOO_LARGE", "File is too large");
        String contentType = normalize(upload.contentType());
        if (!TYPES.contains(contentType)) throw new DomainException("FILE_TYPE_UNSUPPORTED", "Unsupported image type");

        byte[] bytes;
        try {
            bytes = upload.content().readAllBytes();
        } catch (IOException exception) {
            throw new DomainException("FILE_INVALID", "Unable to read file");
        }
        if (bytes.length != upload.size()) throw new DomainException("FILE_INVALID", "Invalid file size");
        String contentHash = sha256(bytes);

        BufferedImage image;
        try {
            image = ImageIO.read(new ByteArrayInputStream(bytes));
        } catch (IOException exception) {
            throw new DomainException("IMAGE_DECODE_FAILED", "Image cannot be decoded");
        }
        if (image == null) throw new DomainException("IMAGE_DECODE_FAILED", "Image cannot be decoded");
        if ((long) image.getWidth() * image.getHeight() > maxPixels) {
            throw new DomainException("IMAGE_DIMENSIONS_INVALID", "Image dimensions exceed limit");
        }

        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            Optional<PhotoProcessingTask> existing = tasks.findByTenantAndIdempotencyKey(tenant, idempotencyKey);
            if (existing.isPresent()) return replayExisting(tenant, existing.get(), contentHash, bytes.length, upload.filename());
        }

        quotas.ensure(tenant, maxBytes, maxPhotos);
        quotas.reserve(tenant, bytes.length, 1);
        UUID photoId = UUID.randomUUID();
        UUID objectId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        String key = "tenant/" + tenant + "/photos/" + photoId + "/original";
        try {
            StoredObject stored = storage.put(key, new ByteArrayInputStream(bytes), contentType, bytes.length);
            Instant now = Instant.now();
            objects.save(new StorageObject(objectId, tenant, stored.bucket(), stored.objectKey(), null, contentType,
                    bytes.length, image.getWidth(), image.getHeight(), contentHash, StorageObjectStatus.UPLOADING, now));
            photos.save(new Photo(photoId, tenant, galleryId, objectId, upload.filename(), 0, false, PhotoStatus.PROCESSING, now));
            tasks.save(new PhotoProcessingTask(taskId, tenant, galleryId, photoId, upload.filename(), TaskStatus.QUEUED,
                    0, "UPLOAD", 0, maxAttempts, null, null, requestId, null, null, null, null, null, null, null,
                    clientBatchId, idempotencyKey, now, now));
            return new UploadResult(photoId, taskId, PhotoStatus.PROCESSING, TaskStatus.QUEUED);
        } catch (RuntimeException exception) {
            quotas.releaseOnce(tenant, "UPLOAD_FAIL", photoId, bytes.length, 1);
            try {
                storage.delete(key);
            } catch (RuntimeException ignored) {
                // Cleanup is best effort; the task is not visible until all records are committed.
            }
            if (exception instanceof DataIntegrityViolationException && idempotencyKey != null && !idempotencyKey.isBlank()) {
                return tasks.findByTenantAndIdempotencyKey(tenant, idempotencyKey)
                        .map(existing -> replayExisting(tenant, existing, contentHash, bytes.length, upload.filename()))
                        .orElseThrow(() -> new DomainException("RESOURCE_CONFLICT", "Upload conflicts with an existing resource"));
            }
            if (exception instanceof DomainException domainException) throw domainException;
            throw new DomainException("STORAGE_UNAVAILABLE", "Object storage is unavailable");
        }
    }

    private UploadResult replayExisting(UUID tenant, PhotoProcessingTask task, String contentHash, long size, String filename) {
        Photo photo = photos.findById(tenant, task.photoId())
                .orElseThrow(() -> new DomainException("RESOURCE_CONFLICT", "Idempotency key belongs to an unavailable upload"));
        StorageObject object = objects.findById(tenant, photo.storageObjectId())
                .orElseThrow(() -> new DomainException("RESOURCE_CONFLICT", "Idempotency key belongs to an unavailable upload"));
        if (!Objects.equals(task.filename(), filename) || object.byteSize() != size
                || (object.sha256() != null && !object.sha256().isBlank() && !object.sha256().equals(contentHash))) {
            throw new DomainException("RESOURCE_CONFLICT", "Idempotency key was already used for a different file");
        }
        return new UploadResult(photo.id(), task.id(), photo.status(), task.status());
    }

    private static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte value : digest) result.append(String.format("%02x", value));
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
    private static String normalize(String type){return type==null?"":type.toLowerCase(Locale.ROOT).split(";")[0].trim();}
    public List<Photo> list(UUID galleryId){UUID t=context.requireContext().tenantId();galleries.findById(t,galleryId).orElseThrow(()->new DomainException("GALLERY_NOT_FOUND","Gallery not found"));return photos.findByGallery(t,galleryId);}
    @Transactional public void delete(UUID photoId){
        UUID t=authorization.requireEditor().tenantId();
        Photo p=photos.findById(t,photoId).orElseThrow(()->new DomainException("PHOTO_NOT_FOUND","Photo not found"));
        deleteInternal(t, p);
    }
    private void deleteInternal(UUID t, Photo p){
        if(photos.softDelete(t,p.id())==0)throw new DomainException("PHOTO_NOT_FOUND","Photo not found");
        galleries.findById(t, p.galleryId()).ifPresent(g -> {
            if (p.id().equals(g.coverPhotoId())) {
                galleries.updateCoverPhoto(t, p.galleryId(), null);
            }
        });
        objects.findById(t,p.storageObjectId()).ifPresent(o -> quotas.releaseOnce(t, "PHOTO", p.id(), o.byteSize(), 1));
        objects.softDelete(t,p.storageObjectId());
    }
    /** 批量软删除同属一个展厅的照片并释放配额；不属于该展厅的照片会被跳过。 */
    @Transactional public BatchDeleteResult deleteAll(UUID galleryId, List<UUID> photoIds){
        UUID t=authorization.requireEditor().tenantId();
        galleries.findById(t, galleryId).orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));
        if (photoIds == null || photoIds.isEmpty()) throw new DomainException("VALIDATION_FAILED", "photoIds is required");
        List<UUID> requested = photoIds.stream().filter(Objects::nonNull).distinct().toList();
        if (requested.isEmpty() || requested.size() > 500) throw new DomainException("VALIDATION_FAILED", "photoIds must contain 1-500 ids");
        int deleted = 0;
        for (UUID photoId : requested) {
            Optional<Photo> found = photos.findById(t, photoId);
            if (found.isEmpty() || !galleryId.equals(found.get().galleryId())) continue;
            deleteInternal(t, found.get());
            deleted++;
        }
        return new BatchDeleteResult(requested.size(), deleted);
    }
    /** 按传入顺序重排展厅内照片的 sort_order；列表外的照片保持原顺序。 */
    @Transactional public ReorderResult reorder(UUID galleryId, List<UUID> orderedPhotoIds){
        UUID t=authorization.requireEditor().tenantId();
        galleries.findById(t, galleryId).orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));
        if (orderedPhotoIds == null || orderedPhotoIds.isEmpty()) throw new DomainException("VALIDATION_FAILED", "orderedPhotoIds is required");
        List<UUID> ordered = orderedPhotoIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ordered.isEmpty() || ordered.size() > 1000) throw new DomainException("VALIDATION_FAILED", "orderedPhotoIds must contain 1-1000 ids");
        Set<UUID> existing = new HashSet<>();
        for (Photo photo : photos.findByGallery(t, galleryId)) existing.add(photo.id());
        for (UUID photoId : ordered) {
            if (!existing.contains(photoId)) throw new DomainException("PHOTO_NOT_FOUND", "Photo " + photoId + " does not belong to this gallery");
        }
        int order = 0;
        for (UUID photoId : ordered) {
            photos.updateMetadata(t, photoId, null, order++, null);
        }
        return new ReorderResult(ordered.size());
    }
    @Transactional public Photo update(UUID photoId,String title,Integer sortOrder,Boolean cover){
        UUID t=authorization.requireEditor().tenantId();
        Photo p = photos.findById(t,photoId).orElseThrow(()->new DomainException("PHOTO_NOT_FOUND","Photo not found"));
        if (cover != null) {
            if (Boolean.TRUE.equals(cover)) {
                photos.clearCoverByGallery(t, p.galleryId());
                galleries.updateCoverPhoto(t, p.galleryId(), photoId);
            } else {
                galleries.findById(t, p.galleryId()).ifPresent(g -> {
                    if (photoId.equals(g.coverPhotoId())) {
                        galleries.updateCoverPhoto(t, p.galleryId(), null);
                    }
                });
            }
        }
        if(photos.updateMetadata(t,photoId,title,sortOrder,cover)==0)throw new DomainException("PHOTO_NOT_FOUND","Photo not found");
        return photos.findById(t,photoId).orElseThrow();
    }
    public record UploadResult(UUID photoId, UUID taskId, PhotoStatus status, TaskStatus taskStatus) {}
    public record ReorderResult(int updated) {}
    public record BatchDeleteResult(int requested, int deleted) {}
}
