package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.TenantContext;
import cn.vie.vibe.gallery.domain.DomainException;
import cn.vie.vibe.gallery.domain.GalleryStatus;
import cn.vie.vibe.gallery.domain.Photo;
import cn.vie.vibe.gallery.application.PhotoRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.List;

@Service
public class GalleryFacade {
    private final GalleryRepository galleries;
    private final TenantContextResolver tenantContext;
    private final PhotoRepository photos;
    private final WorkspaceAuthorizationPolicy authorization;
    private final PasswordHasher passwordHasher;
    private final StorageObjectRepository objects;
    private final TenantQuotaRepository quotas;

    public GalleryFacade(GalleryRepository galleries, TenantContextResolver tenantContext) {
        this(galleries, tenantContext, null, new WorkspaceAuthorizationPolicy(tenantContext), null, null, null);
    }

    public GalleryFacade(GalleryRepository galleries, TenantContextResolver tenantContext, PhotoRepository photos) {
        this(galleries, tenantContext, photos, new WorkspaceAuthorizationPolicy(tenantContext), null, null, null);
    }

    public GalleryFacade(GalleryRepository galleries, TenantContextResolver tenantContext, PhotoRepository photos,
                         WorkspaceAuthorizationPolicy authorization, PasswordHasher passwordHasher) {
        this(galleries, tenantContext, photos, authorization, passwordHasher, null, null);
    }

    @Autowired
    public GalleryFacade(GalleryRepository galleries, TenantContextResolver tenantContext, PhotoRepository photos,
                         WorkspaceAuthorizationPolicy authorization, PasswordHasher passwordHasher,
                         StorageObjectRepository objects, TenantQuotaRepository quotas) {
        this.galleries = galleries;
        this.tenantContext = tenantContext;
        this.photos = photos;
        this.authorization = authorization;
        this.passwordHasher = passwordHasher;
        this.objects = objects;
        this.quotas = quotas;
    }

    public List<Gallery> list() {
        return galleries.findAll(tenantContext.requireContext().tenantId());
    }

    public Gallery get(java.util.UUID galleryId) {
        java.util.UUID tenantId = tenantContext.requireContext().tenantId();
        return galleries.findById(tenantId, galleryId)
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));
    }

    @Transactional
    public Gallery create(String name, String slug, GalleryVisibility visibility) {
        TenantContext context = authorization.requireOwner();
        String normalizedSlug = slug == null ? "" : slug.trim().toLowerCase(java.util.Locale.ROOT);
        if (normalizedSlug.length() > 80 || !normalizedSlug.matches("[a-z0-9]+(?:-[a-z0-9]+)*")) {
            throw new DomainException("VALIDATION_FAILED", "Slug must contain lowercase letters, numbers, and hyphens");
        }
        if (galleries.findByTenantAndSlug(context.tenantId(), normalizedSlug).isPresent()) {
            throw new DomainException("GALLERY_SLUG_CONFLICT", "Gallery slug is already in use");
        }
        Gallery gallery = new Gallery(java.util.UUID.randomUUID(), context.tenantId(), normalizedSlug, name,
                visibility, null, null, false, java.time.Instant.now(), GalleryStatus.DRAFT, null);
        try {
            return galleries.save(gallery);
        } catch (DataIntegrityViolationException exception) {
            throw new DomainException("GALLERY_SLUG_CONFLICT", "Gallery slug is already in use");
        }
    }

    @Transactional
    public Gallery publish(java.util.UUID galleryId) {
        TenantContext context = authorization.requireOwner();
        Gallery gallery = galleries.findById(context.tenantId(), galleryId)
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));
        if (gallery.status() == GalleryStatus.ARCHIVED) {
            throw new DomainException("GALLERY_ALREADY_ARCHIVED", "Archived gallery cannot be published");
        }
        if (gallery.status() == GalleryStatus.PUBLISHED) return gallery;
        if (photos == null || photos.countPublicReadyByGalleryId(context.tenantId(), galleryId) < 1) {
            throw new DomainException("GALLERY_NOT_READY", "Gallery must contain at least one READY photo");
        }
        Gallery updated = new Gallery(gallery.id(), gallery.tenantId(), gallery.slug(), gallery.name(),
                gallery.visibility(), gallery.passwordHash(), gallery.coverPhotoId(), gallery.deleted(), gallery.createdAt(),
                GalleryStatus.PUBLISHED, java.time.Instant.now());
        galleries.update(updated);
        return updated;
    }

    @Transactional
    public Gallery unpublish(java.util.UUID galleryId) {
        TenantContext context = authorization.requireOwner();
        Gallery gallery = galleries.findById(context.tenantId(), galleryId)
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));
        if (gallery.status() == GalleryStatus.DRAFT) return gallery;
        if (gallery.status() == GalleryStatus.ARCHIVED) {
            throw new DomainException("GALLERY_STATE_CONFLICT", "Archived gallery cannot be unpublished");
        }
        Gallery updated = new Gallery(gallery.id(), gallery.tenantId(), gallery.slug(), gallery.name(),
                gallery.visibility(), gallery.passwordHash(), gallery.coverPhotoId(), gallery.deleted(), gallery.createdAt(),
                GalleryStatus.DRAFT, null);
        galleries.update(updated);
        return updated;
    }

    @Transactional
    public Gallery setPassword(java.util.UUID galleryId, String rawPassword) {
        TenantContext context = authorization.requireOwner();
        Gallery gallery = galleries.findById(context.tenantId(), galleryId)
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));
        
        if (gallery.visibility() != GalleryVisibility.PASSWORD) {
            throw new DomainException("INVALID_OPERATION", "Gallery must have PASSWORD visibility to set password");
        }
        
        if (passwordHasher == null) {
            throw new IllegalStateException("PasswordHasher not available");
        }
        
        String passwordHash = passwordHasher.hash(rawPassword);
        Gallery updated = new Gallery(gallery.id(), gallery.tenantId(), gallery.slug(), gallery.name(),
                gallery.visibility(), passwordHash, gallery.coverPhotoId(), gallery.deleted(), gallery.createdAt(),
                gallery.status(), gallery.publishedAt());
        galleries.update(updated);
        return updated;
    }

    @Transactional
    public Gallery clearPassword(java.util.UUID galleryId) {
        TenantContext context = authorization.requireOwner();
        Gallery gallery = galleries.findById(context.tenantId(), galleryId)
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));
        
        Gallery updated = new Gallery(gallery.id(), gallery.tenantId(), gallery.slug(), gallery.name(),
                gallery.visibility(), null, gallery.coverPhotoId(), gallery.deleted(), gallery.createdAt(),
                gallery.status(), gallery.publishedAt());
        galleries.update(updated);
        return updated;
    }

    @Transactional
    public Gallery updateVisibility(java.util.UUID galleryId, GalleryVisibility visibility) {
        TenantContext context = authorization.requireOwner();
        Gallery gallery = galleries.findById(context.tenantId(), galleryId)
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));
        if (visibility == null) {
            throw new DomainException("VALIDATION_FAILED", "Visibility cannot be null");
        }
        String passwordHash = visibility == GalleryVisibility.PASSWORD ? gallery.passwordHash() : null;
        Gallery updated = new Gallery(gallery.id(), gallery.tenantId(), gallery.slug(), gallery.name(),
                visibility, passwordHash, gallery.coverPhotoId(), gallery.deleted(), gallery.createdAt(),
                gallery.status(), gallery.publishedAt());
        galleries.update(updated);
        return updated;
    }

    @Transactional
    public Gallery rename(java.util.UUID galleryId, String name) {
        TenantContext context = authorization.requireOwner();
        Gallery gallery = galleries.findById(context.tenantId(), galleryId)
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));
        String normalized = name == null ? "" : name.trim();
        if (normalized.isEmpty() || normalized.length() > 160) {
            throw new DomainException("VALIDATION_FAILED", "Gallery name must contain 1-160 characters");
        }
        Gallery updated = new Gallery(gallery.id(), gallery.tenantId(), gallery.slug(), normalized,
                gallery.visibility(), gallery.passwordHash(), gallery.coverPhotoId(), gallery.deleted(), gallery.createdAt(),
                gallery.status(), gallery.publishedAt());
        galleries.update(updated);
        return updated;
    }

    /**
     * 软删除展厅及其全部照片并释放配额。已发布的展厅必须先撤回发布。
     */
    @Transactional
    public void delete(java.util.UUID galleryId) {
        TenantContext context = authorization.requireOwner();
        Gallery gallery = galleries.findById(context.tenantId(), galleryId)
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));
        if (gallery.status() == GalleryStatus.PUBLISHED) {
            throw new DomainException("GALLERY_STATE_CONFLICT", "Unpublish the gallery before deleting it");
        }
        if (photos != null) {
            for (Photo photo : photos.findByGallery(context.tenantId(), galleryId)) {
                photos.softDelete(context.tenantId(), photo.id());
                if (objects != null) {
                    objects.findById(context.tenantId(), photo.storageObjectId()).ifPresent(object -> {
                        if (quotas != null) {
                            quotas.releaseOnce(context.tenantId(), "PHOTO", photo.id(), object.byteSize(), 1);
                        }
                        objects.softDelete(context.tenantId(), photo.storageObjectId());
                    });
                }
            }
        }
        if (galleries.softDelete(context.tenantId(), galleryId) == 0) {
            throw new DomainException("GALLERY_NOT_FOUND", "Gallery not found");
        }
    }
}
