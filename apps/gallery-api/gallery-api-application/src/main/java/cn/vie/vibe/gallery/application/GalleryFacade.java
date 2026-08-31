package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.TenantContext;
import cn.vie.vibe.gallery.domain.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.List;

@Service
public class GalleryFacade {
    private final GalleryRepository galleries;
    private final TenantContextResolver tenantContext;

    public GalleryFacade(GalleryRepository galleries, TenantContextResolver tenantContext) {
        this.galleries = galleries;
        this.tenantContext = tenantContext;
    }

    public List<Gallery> list() {
        return galleries.findAll(tenantContext.requireContext().tenantId());
    }

    @Transactional
    public Gallery create(String name, String slug, GalleryVisibility visibility) {
        TenantContext context = tenantContext.requireContext();
        String normalizedSlug = slug == null ? "" : slug.trim().toLowerCase(java.util.Locale.ROOT);
        if (normalizedSlug.length() > 80 || !normalizedSlug.matches("[a-z0-9]+(?:-[a-z0-9]+)*")) {
            throw new DomainException("VALIDATION_FAILED", "Slug must contain lowercase letters, numbers, and hyphens");
        }
        if (galleries.findByTenantAndSlug(context.tenantId(), normalizedSlug).isPresent()) {
            throw new DomainException("GALLERY_SLUG_CONFLICT", "Gallery slug is already in use");
        }
        Gallery gallery = new Gallery(java.util.UUID.randomUUID(), context.tenantId(), normalizedSlug, name, 
                visibility, false, java.time.Instant.now());
        try {
            return galleries.save(gallery);
        } catch (DataIntegrityViolationException exception) {
            throw new DomainException("GALLERY_SLUG_CONFLICT", "Gallery slug is already in use");
        }
    }
}
