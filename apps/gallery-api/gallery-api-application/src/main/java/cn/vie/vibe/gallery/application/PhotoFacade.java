package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.*;
import java.time.Instant;
import java.util.*;

@Service
public class PhotoFacade {
    private static final Set<String> TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    private final GalleryLookup galleries; private final PhotoRepository photos; private final StorageObjectRepository objects;
    private final PhotoProcessingTaskRepository tasks; private final TenantQuotaRepository quotas; private final ObjectStoragePort storage;
    private final TenantContextResolver context; private final long maxFileSize, maxPixels, maxBytes, maxPhotos;
    public PhotoFacade(GalleryLookup galleries, PhotoRepository photos, StorageObjectRepository objects, PhotoProcessingTaskRepository tasks,
                       TenantQuotaRepository quotas, ObjectStoragePort storage, TenantContextResolver context,
                       @Value("${gallery.quota.max-file-size:104857600}") long maxFileSize,
                       @Value("${gallery.quota.max-pixels:40000000}") long maxPixels,
                       @Value("${gallery.quota.max-bytes:5368709120}") long maxBytes,
                       @Value("${gallery.quota.max-photos:10000}") long maxPhotos) {
        this.galleries=galleries;this.photos=photos;this.objects=objects;this.tasks=tasks;this.quotas=quotas;this.storage=storage;this.context=context;
        this.maxFileSize=maxFileSize;this.maxPixels=maxPixels;this.maxBytes=maxBytes;this.maxPhotos=maxPhotos;
    }
    @Transactional public UploadResult upload(UUID galleryId, PhotoUpload upload) {
        UUID tenant=context.requireContext().tenantId();
        galleries.findById(tenant,galleryId).orElseThrow(()->new DomainException("GALLERY_NOT_FOUND","Gallery not found"));
        if (upload.size()<=0) throw new DomainException("FILE_INVALID","Empty file");
        if (upload.size()>maxFileSize) throw new DomainException("FILE_TOO_LARGE","File is too large");
        if (!TYPES.contains(normalize(upload.contentType()))) throw new DomainException("FILE_TYPE_UNSUPPORTED","Unsupported image type");
        byte[] bytes; try { bytes=upload.content().readAllBytes(); } catch(IOException e){ throw new DomainException("FILE_INVALID","Unable to read file"); }
        if(bytes.length!=upload.size()) throw new DomainException("FILE_INVALID","Invalid file size");
        BufferedImage image; try { image=ImageIO.read(new ByteArrayInputStream(bytes)); } catch(IOException e){ throw new DomainException("IMAGE_DECODE_FAILED","Image cannot be decoded"); }
        if(image==null) throw new DomainException("IMAGE_DECODE_FAILED","Image cannot be decoded");
        if((long)image.getWidth()*image.getHeight()>maxPixels) throw new DomainException("IMAGE_DIMENSIONS_INVALID","Image dimensions exceed limit");
        quotas.ensure(tenant,maxBytes,maxPhotos); quotas.reserve(tenant,bytes.length,1);
        UUID photoId=UUID.randomUUID(), objectId=UUID.randomUUID(), taskId=UUID.randomUUID(); String key="tenant/"+tenant+"/photos/"+photoId+"/original";
        try {
            StoredObject stored=storage.put(key,new ByteArrayInputStream(bytes),normalize(upload.contentType()),bytes.length); Instant now=Instant.now();
            objects.save(new StorageObject(objectId,tenant,stored.bucket(),stored.objectKey(),null,normalize(upload.contentType()),bytes.length,image.getWidth(),image.getHeight(),stored.sha256(),StorageObjectStatus.UPLOADING,now));
            photos.save(new Photo(photoId,tenant,galleryId,objectId,upload.filename(),0,false,PhotoStatus.PROCESSING,now));
            tasks.save(new PhotoProcessingTask(taskId,tenant,photoId,TaskStatus.PENDING,0,null,null,null)); return new UploadResult(photoId,taskId,PhotoStatus.PROCESSING);
        } catch(RuntimeException ex){ quotas.release(tenant,bytes.length,1); try{storage.delete(key);}catch(RuntimeException ignored){} if(ex instanceof DomainException d) throw d; throw new DomainException("STORAGE_UNAVAILABLE","Object storage is unavailable"); }
    }
    private static String normalize(String type){return type==null?"":type.toLowerCase(Locale.ROOT).split(";")[0].trim();}
    public List<Photo> list(UUID galleryId){UUID t=context.requireContext().tenantId();galleries.findById(t,galleryId).orElseThrow(()->new DomainException("GALLERY_NOT_FOUND","Gallery not found"));return photos.findByGallery(t,galleryId);}
    @Transactional public void delete(UUID photoId){UUID t=context.requireContext().tenantId();Photo p=photos.findById(t,photoId).orElseThrow(()->new DomainException("PHOTO_NOT_FOUND","Photo not found"));if(photos.softDelete(t,photoId)==0)throw new DomainException("PHOTO_NOT_FOUND","Photo not found");objects.findById(t,p.storageObjectId()).ifPresent(o -> quotas.release(t,o.byteSize(),1)); objects.softDelete(t,p.storageObjectId());}
    @Transactional public Photo update(UUID photoId,String title,Integer sortOrder,Boolean cover){UUID t=context.requireContext().tenantId();photos.findById(t,photoId).orElseThrow(()->new DomainException("PHOTO_NOT_FOUND","Photo not found"));if(photos.updateMetadata(t,photoId,title,sortOrder,cover)==0)throw new DomainException("PHOTO_NOT_FOUND","Photo not found");return photos.findById(t,photoId).orElseThrow();}
    public record UploadResult(UUID photoId,UUID taskId,PhotoStatus status){}
}
