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
            quotas.release(tenant, bytes.length, 1);
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
        if(photos.softDelete(t,photoId)==0)throw new DomainException("PHOTO_NOT_FOUND","Photo not found");
        galleries.findById(t, p.galleryId()).ifPresent(g -> {
            if (photoId.equals(g.coverPhotoId())) {
                galleries.updateCoverPhoto(t, p.galleryId(), null);
            }
        });
        objects.findById(t,p.storageObjectId()).ifPresent(o -> quotas.release(t,o.byteSize(),1)); 
        objects.softDelete(t,p.storageObjectId());
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
}
