package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.GalleryViewerConfigFacade;
import cn.vie.vibe.gallery.application.PublicAccessFacade;
import cn.vie.vibe.gallery.application.PublicGalleryView;
import cn.vie.vibe.gallery.application.PublicPhotoPage;
import cn.vie.vibe.gallery.application.PublicPhotoView;
import cn.vie.vibe.gallery.domain.GalleryVisibility;
import cn.vie.vibe.gallery.domain.PublicAccessException;
import cn.vie.vibe.gallery.domain.PublicAccessState;
import jakarta.servlet.http.HttpServletRequest;
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
    private static final String PUBLIC_SESSION_PASSWORD_FP = "public_password_fp";
    private static final int PUBLIC_SESSION_TTL_SECONDS = 1800;

    private final PublicAccessFacade publicAccessFacade;
    private final GalleryViewerConfigFacade configFacade;
    private final RedisRateLimiter rateLimiter;
    private final GalleryMetrics metrics;

    public PublicGalleryController(
            PublicAccessFacade publicAccessFacade,
            GalleryViewerConfigFacade configFacade,
            RedisRateLimiter rateLimiter
    ) {
        this(publicAccessFacade, configFacade, rateLimiter, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public PublicGalleryController(
            PublicAccessFacade publicAccessFacade,
            GalleryViewerConfigFacade configFacade,
            RedisRateLimiter rateLimiter,
            GalleryMetrics metrics
    ) {
        this.publicAccessFacade = publicAccessFacade;
        this.configFacade = configFacade;
        this.rateLimiter = rateLimiter;
        this.metrics = metrics;
    }

    /**
     * 获取公开相册状态。
     */
    @GetMapping("/{slug}")
    public PublicGalleryResponse getGallery(
            @PathVariable("slug") String slug,
            @RequestHeader(value = "X-Share-Token", required = false) String shareToken,
            @RequestHeader(value = "X-Preview-Token", required = false) String previewHeader,
            @RequestParam(value = "preview", required = false) String previewQuery,
            HttpSession session
    ) {
        if (metrics != null) {
            metrics.recordPublicAccess(slug);
        }
        PublicGalleryView view = publicAccessFacade.resolvePublicGallery(
                slug, shareToken, readUnlockSession(session), previewToken(previewHeader, previewQuery));

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
    public ResponseEntity<PublicViewerConfigResponse> getViewerConfig(
            @PathVariable("slug") String slug,
            @RequestHeader(value = "X-Share-Token", required = false) String shareToken,
            @RequestHeader(value = "X-Preview-Token", required = false) String previewHeader,
            @RequestParam(value = "preview", required = false) String previewQuery,
            HttpSession session
    ) {
        String preview = previewToken(previewHeader, previewQuery);
        publicAccessFacade.validateViewerConfigAccess(slug, shareToken, readUnlockSession(session), preview);
        boolean includeDraft = publicAccessFacade.allowsCreatorPreview(slug, preview);
        return configFacade.getPublicConfig(slug, includeDraft)
                .map(config -> new PublicViewerConfigResponse(
                        config.id().toString(),
                        config.galleryId().toString(),
                        config.configJson(),
                        config.enabled(),
                        config.presetName(),
                        config.createdAt(),
                        config.updatedAt(),
                        config.schemaVersion()
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
            HttpSession session,
            HttpServletRequest httpRequest
    ) {
        String identity = slug + "|" + clientIp(httpRequest);
        rateLimiter.assertUnlockAllowed(identity);
        cn.vie.vibe.gallery.application.PublicUnlockSession unlock;
        try {
            unlock = publicAccessFacade.unlockGallery(slug, shareToken, request.password());
        } catch (PublicAccessException exception) {
            if (PublicAccessException.PASSWORD_INVALID.equals(exception.getCode())) {
                rateLimiter.recordUnlockFailure(identity);
            }
            throw exception;
        }
        rateLimiter.resetUnlock(identity);
        Instant expiresAt = Instant.now().plusSeconds(PUBLIC_SESSION_TTL_SECONDS);

        // 保存 gallery ID、密码指纹与绝对过期时间；不保存明文密码或 raw token。
        session.setAttribute(PUBLIC_SESSION_GALLERY_ID, unlock.galleryId().toString());
        session.setAttribute(PUBLIC_SESSION_PASSWORD_FP, unlock.passwordFingerprint());
        session.setAttribute(PUBLIC_SESSION_EXPIRES_AT, expiresAt.toString());
        session.setMaxInactiveInterval(PUBLIC_SESSION_TTL_SECONDS);

        return new UnlockResponse(true, expiresAt);
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma >= 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        return request.getRemoteAddr();
    }

    /**
     * 获取公开照片列表。
     */
    @GetMapping("/{slug}/photos")
    public PhotoListResponse getPhotos(
            @PathVariable("slug") String slug,
            @RequestHeader(value = "X-Share-Token", required = false) String shareToken,
            @RequestHeader(value = "X-Preview-Token", required = false) String previewHeader,
            @RequestParam(value = "preview", required = false) String previewQuery,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "pageSize", defaultValue = "50") int pageSize,
            HttpSession session
    ) {
        var unlockSession = readUnlockSession(session);
        PublicPhotoPage result = publicAccessFacade.listPublicPhotos(
                slug,
                shareToken,
                unlockSession,
                previewToken(previewHeader, previewQuery),
                page,
                pageSize
        );

        List<PhotoResponse> items = result.items().stream()
                .map(p -> new PhotoResponse(
                        p.title(),
                        p.thumbnailUrl(),
                        p.width(),
                        p.height(),
                        p.sortOrder(),
                        p.mediumUrl(),
                        p.textureUrl()
                ))
                .toList();

        return new PhotoListResponse(items, result.page(), result.pageSize(), result.total());
    }

    private static String previewToken(String header, String query) {
        if (header != null && !header.isBlank()) return header.trim();
        if (query != null && !query.isBlank()) return query.trim();
        return null;
    }

    private cn.vie.vibe.gallery.application.PublicUnlockSession readUnlockSession(HttpSession session) {
        Object rawGalleryId = session.getAttribute(PUBLIC_SESSION_GALLERY_ID);
        Object rawExpiresAt = session.getAttribute(PUBLIC_SESSION_EXPIRES_AT);
        Object rawFingerprint = session.getAttribute(PUBLIC_SESSION_PASSWORD_FP);
        if (!(rawGalleryId instanceof String galleryIdValue) || !(rawExpiresAt instanceof String expiresAtValue)
                || !(rawFingerprint instanceof String fingerprint) || fingerprint.isBlank()) {
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
            return new cn.vie.vibe.gallery.application.PublicUnlockSession(galleryId, fingerprint);
        } catch (IllegalArgumentException exception) {
            clearPublicSession(session);
            return null;
        }
    }

    private void clearPublicSession(HttpSession session) {
        session.removeAttribute(PUBLIC_SESSION_GALLERY_ID);
        session.removeAttribute(PUBLIC_SESSION_EXPIRES_AT);
        session.removeAttribute(PUBLIC_SESSION_PASSWORD_FP);
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
            int sortOrder,
            String mediumUrl,
            String textureUrl
    ) {}

    public record PhotoListResponse(
            List<PhotoResponse> items,
            int page,
            int pageSize,
            int total
    ) {}

    public record PublicViewerConfigResponse(
            String id,
            String galleryId,
            String configJson,
            boolean enabled,
            String presetName,
            Instant createdAt,
            Instant updatedAt,
            int schemaVersion
    ) {}
}
