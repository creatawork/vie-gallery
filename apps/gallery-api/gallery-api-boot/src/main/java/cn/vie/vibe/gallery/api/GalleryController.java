package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.GalleryFacade;
import cn.vie.vibe.gallery.domain.Gallery;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;

import java.util.List;

@RestController
@RequestMapping("/api/galleries")
public class GalleryController {
    private final GalleryFacade facade;
    public GalleryController(GalleryFacade facade) { this.facade = facade; }

    @GetMapping public List<GalleryResponse> list() {
        return facade.list().stream().map(GalleryResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GalleryResponse create(@Valid @RequestBody CreateGalleryRequest request) {
        return GalleryResponse.from(facade.create(request.name().trim(), request.slug().trim(), request.visibility()));
    }

    public record CreateGalleryRequest(@NotBlank @Size(max = 160) String name,
                                       @NotBlank @Size(max = 80) String slug,
                                       GalleryVisibility visibility) {
        public CreateGalleryRequest { if (visibility == null) visibility = GalleryVisibility.PRIVATE; }
    }

    public record GalleryResponse(String id, String slug, String name, GalleryVisibility visibility,
                                  java.time.Instant createdAt) {
        static GalleryResponse from(Gallery gallery) {
            return new GalleryResponse(gallery.id().toString(), gallery.slug(), gallery.name(),
                    gallery.visibility(), gallery.createdAt());
        }
    }
}
