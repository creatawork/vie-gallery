package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.PublicAccessFacade;
import cn.vie.vibe.gallery.application.PublicGalleryView;
import cn.vie.vibe.gallery.application.PublicPhotoView;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.PublicAccessState;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 公开展示 Controller
 */
@RestController
@RequestMapping("/api/public/g")
public class PublicGalleryController {
    private final PublicAccessFacade publicAccessFacade;
    private static final String PUBLIC_SESSION_GALLERY_ID = "public_gallery_id";
    private static final String PUBLIC_SESSION_EXPIRES_AT = "public_expires_at";

    public PublicGalleryController(
        PublicAccessFacade publicAccessFacade
    ) {
        this.publicAccessFacade = publicAccessFacade;
    }

    /**
     * 获取公开相册状态
     */
    @GetMapping("/{slug}")
    public PublicGalleryResponse getGallery(
            @PathVariable("slug") String slug,
            @RequestHeader(value = "X-Share-Token", required = false) String shareToken
    ) {
        PublicGalleryView view = publicAccessFacade.resolvePublicGallery(slug, shareToken);

        CoverResponse cover = null;
        if (view.cover() != null) {
            cover = new CoverResponse(
                    view.cover().url(),
                    view.cover().width(),
                    view.cover().height()
            );
        }

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
     * 解锁密码相册
     */
    @PostMapping("/{slug}/unlock")
    public UnlockResponse unlock(
            @PathVariable("slug") String slug,
            @RequestHeader(value = "X-Share-Token", required = false) String shareToken,
            @Valid @RequestBody UnlockRequest request,
            HttpSession session
    ) {
        publicAccessFacade.unlockGallery(slug, shareToken, request.password());

        // 创建公开访问 Session（30 分钟有效期）
        Instant expiresAt = Instant.now().plusSeconds(1800);
        session.setAttribute(PUBLIC_SESSION_GALLERY_ID, slug);
        session.setAttribute(PUBLIC_SESSION_EXPIRES_AT, expiresAt.toString());
        session.setMaxInactiveInterval(1800);

        return new UnlockResponse(true, expiresAt);
    }

    /**
     * 获取公开照片列表
     */
    @GetMapping("/{slug}/photos")
    public PhotoListResponse getPhotos(
            @PathVariable("slug") String slug,
            @RequestHeader(value = "X-Share-Token", required = false) String shareToken,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "pageSize", defaultValue = "50") int pageSize,
            HttpSession session
    ) {
        // 从 Session 获取公开访问相册 ID
        String sessionGallerySlug = (String) session.getAttribute(PUBLIC_SESSION_GALLERY_ID);
        UUID publicSessionGalleryId = null;

        // 简化：将 slug 用于验证，实际应该存储 gallery ID
        if (slug.equals(sessionGallerySlug)) {
            // Session 有效，允许访问
            publicSessionGalleryId = UUID.randomUUID(); // 占位，实际应从相册查询
        }

        List<PublicPhotoView> photos = publicAccessFacade.listPublicPhotos(
                slug,
                shareToken,
                publicSessionGalleryId,
                page,
                pageSize
        );

        List<PhotoResponse> items = photos.stream()
                .map(p -> new PhotoResponse(
                        p.title(),
                        p.thumbnailUrl(),
                        p.width(),
                        p.height(),
                        p.sortOrder()
                ))
                .toList();

        // 简化的分页响应（实际需要查询总数）
        return new PhotoListResponse(items, page, pageSize, items.size());
    }

    // Request & Response records

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
