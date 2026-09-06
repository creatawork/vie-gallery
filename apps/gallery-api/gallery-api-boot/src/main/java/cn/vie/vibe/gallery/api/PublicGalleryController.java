package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.GalleryViewerConfigFacade;
import cn.vie.vibe.gallery.application.PublicAccessFacade;
import cn.vie.vibe.gallery.application.PublicGalleryView;
import cn.vie.vibe.gallery.application.PublicPhotoPage;
import cn.vie.vibe.gallery.application.PublicPhotoView;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.PublicAccessState;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 公开展示 Controller。
 */
@RestController
@RequestMapping("/api/public/g")
public class PublicGalleryController {
    private static final String PUBLIC_SESSION_GALLERY_ID = "public_gallery_id";
    private static final String PUBLIC_SESSION_EXPIRES_AT = "public_expires_at";
    private static final int PUBLIC_SESSION_TTL_SECONDS = 1800;

    private final PublicAccessFacade publicAccessFacade;
    private final GalleryViewerConfigFacade configFacade;

    public PublicGalleryController(
            PublicAccessFacade publicAccessFacade,
            GalleryViewerConfigFacade configFacade
    ) {
        this.publicAccessFacade = publicAccessFacade;
        this.configFacade = configFacade;
    }

    /**
     * 获取公开相册状态。
     */
    @GetMapping("/{slug}")
    public PublicGalleryResponse getGallery(
            @PathVariable("slug") String slug,
            @RequestHeader(value = "X-Share-Token", required = false) String shareToken,
            HttpSession session
    ) {
        PublicGalleryView view = publicAccessFacade.resolvePublicGallery(slug, shareToken, readSessionGalleryId(session));

        CoverResponse cover = view.cover() == null ? null : new CoverResponse(
                view.cover().url(),
                view.cover().width(),
                view.cover().height()
        );

        return new PublicGalleryResponse(
                view.slug(),
                view.title(),
                view.visibility(),
                view.accessState(),
                cover,
                view.photoCount()
        );
    }

    /**
     * 获取相册 3D 视觉展示配置。
     */
    @GetMapping("/{slug}/viewer-config")
    public ResponseEntity<GalleryViewerConfigController.GalleryViewerConfigResponse> getViewerConfig(
            @PathVariable("slug") String slug,
            @RequestHeader(value = "X-Share-Token", required = false) String shareToken,
            HttpSession session
    ) {
        publicAccessFacade.validateViewerConfigAccess(slug, shareToken, readSessionGalleryId(session));
        return configFacade.getPublicConfig(slug)
                .map(config -> new GalleryViewerConfigController.GalleryViewerConfigResponse(
                        config.id().toString(),
                        config.galleryId().toString(),
                        config.configJson(),
                        config.enabled(),
                        config.presetName(),
                        config.createdAt(),
                        config.updatedAt()
                ))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).build());
    }

    /**
     * 解锁密码相册。
     */
    @PostMapping("/{slug}/unlock")
    public UnlockResponse unlock(
            @PathVariable("slug") String slug,
            @RequestHeader(value = "X-Share-Token", required = false) String shareToken,
            @Valid @RequestBody UnlockRequest request,
            HttpSession session
    ) {
        UUID galleryId = publicAccessFacade.unlockGallery(slug, shareToken, request.password());
        Instant expiresAt = Instant.now().plusSeconds(PUBLIC_SESSION_TTL_SECONDS);

        // 只保存真实 gallery ID 和绝对过期时间，不保存密码或 raw token。
        session.setAttribute(PUBLIC_SESSION_GALLERY_ID, galleryId.toString());
        session.setAttribute(PUBLIC_SESSION_EXPIRES_AT, expiresAt.toString());
        session.setMaxInactiveInterval(PUBLIC_SESSION_TTL_SECONDS);

        return new UnlockResponse(true, expiresAt);
    }

    /**
     * 获取公开照片列表。
     */
    @GetMapping("/{slug}/photos")
    public PhotoListResponse getPhotos(
            @PathVariable("slug") String slug,
            @RequestHeader(value = "X-Share-Token", required = false) String shareToken,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "pageSize", defaultValue = "50") int pageSize,
            HttpSession session
    ) {
        UUID publicSessionGalleryId = readSessionGalleryId(session);
        PublicPhotoPage result = publicAccessFacade.listPublicPhotos(
                slug,
                shareToken,
                publicSessionGalleryId,
                page,
                pageSize
        );

        List<PhotoResponse> items = result.items().stream()
                .map(p -> new PhotoResponse(
                        p.title(),
                        p.thumbnailUrl(),
                        p.width(),
                        p.height(),
                        p.sortOrder()
                ))
                .toList();

        return new PhotoListResponse(items, result.page(), result.pageSize(), result.total());
    }

    private UUID readSessionGalleryId(HttpSession session) {
        Object rawGalleryId = session.getAttribute(PUBLIC_SESSION_GALLERY_ID);
        Object rawExpiresAt = session.getAttribute(PUBLIC_SESSION_EXPIRES_AT);
        if (!(rawGalleryId instanceof String galleryIdValue) || !(rawExpiresAt instanceof String expiresAtValue)) {
            clearPublicSession(session);
            return null;
        }

        try {
            UUID galleryId = UUID.fromString(galleryIdValue);
            Instant expiresAt = Instant.parse(expiresAtValue);
            if (!Instant.now().isBefore(expiresAt)) {
                clearPublicSession(session);
                return null;
            }
            return galleryId;
        } catch (IllegalArgumentException exception) {
            clearPublicSession(session);
            return null;
        }
    }

    private void clearPublicSession(HttpSession session) {
        session.removeAttribute(PUBLIC_SESSION_GALLERY_ID);
        session.removeAttribute(PUBLIC_SESSION_EXPIRES_AT);
    }

    public record PublicGalleryResponse(
            String slug,
            String title,
            GalleryVisibility visibility,
            PublicAccessState accessState,
            CoverResponse cover,
            int photoCount
    ) {}

    public record CoverResponse(
            String url,
            int width,
            int height
    ) {}

    public record UnlockRequest(@NotBlank String password) {}

    public record UnlockResponse(boolean unlocked, Instant expiresAt) {}

    public record PhotoResponse(
            String title,
            String thumbnailUrl,
            int width,
            int height,
            int sortOrder
    ) {}

    public record PhotoListResponse(
            List<PhotoResponse> items,
            int page,
            int pageSize,
            int total
    ) {}
}
