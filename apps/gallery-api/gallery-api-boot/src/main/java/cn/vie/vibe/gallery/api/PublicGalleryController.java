package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.GalleryRepository;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.DomainException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/public/g")
public class PublicGalleryController {
    private final GalleryRepository galleries;
    public PublicGalleryController(GalleryRepository galleries) { this.galleries = galleries; }

    @GetMapping("/{slug}")
    public PublicGalleryResponse get(@PathVariable("slug") String slug) {
        Gallery gallery = galleries.findBySlug(slug)
                .filter(g -> g.visibility() == GalleryVisibility.PUBLIC)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Resource not found"));
        return new PublicGalleryResponse(gallery.slug(), gallery.name(), gallery.visibility());
    }

    @PostMapping("/{slug}/unlock") public ResponseEntity<Void> unlock(@PathVariable("slug") String slug) {
        galleries.findBySlug(slug)
                .filter(g -> g.visibility() == GalleryVisibility.PUBLIC)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Resource not found"));
        return ResponseEntity.noContent().build();
    }

    public record PublicGalleryResponse(String slug, String name, GalleryVisibility visibility) {}
}
