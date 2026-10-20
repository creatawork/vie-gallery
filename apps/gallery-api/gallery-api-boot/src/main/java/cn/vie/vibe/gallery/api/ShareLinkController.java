package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.CreateShareLinkCommand;
import cn.vie.vibe.gallery.application.CreateShareLinkResult;
import cn.vie.vibe.gallery.application.CreateShortUrlResult;
import cn.vie.vibe.gallery.application.GenerateShareLinkQrResult;
import cn.vie.vibe.gallery.application.GenerateSharePosterCommand;
import cn.vie.vibe.gallery.application.GenerateSharePosterResult;
import cn.vie.vibe.gallery.application.ShareLinkFacade;
import cn.vie.vibe.gallery.application.ShareLinkView;
import cn.vie.vibe.gallery.application.ShortLinkTarget;
import cn.vie.vibe.gallery.domain.ShareLinkStatus;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

/**
 * 分享链接管理 Controller
 */
@RestController
public class ShareLinkController {
    private final ShareLinkFacade shareLinkFacade;

    public ShareLinkController(ShareLinkFacade shareLinkFacade) {
        this.shareLinkFacade = shareLinkFacade;
    }

    /**
     * 创建分享链接
     */
    @PostMapping("/api/galleries/{galleryId}/share-links")
    @ResponseStatus(HttpStatus.CREATED)
    public CreateShareLinkResponse createShareLink(
            @PathVariable("galleryId") String galleryId,
            @Valid @RequestBody(required = false) CreateShareLinkRequest request
    ) {
        CreateShareLinkCommand command = new CreateShareLinkCommand(galleryId, request != null ? request.expiresAt() : null);
        CreateShareLinkResult result = shareLinkFacade.createShareLink(command);

        return new CreateShareLinkResponse(
                result.id().toString(),
                result.galleryId().toString(),
                result.expiresAt(),
                result.createdAt(),
                result.status(),
                result.shareUrl(),
                result.rawToken()
        );
    }

    /**
     * 列出相册的分享链接
     */
    @GetMapping("/api/galleries/{galleryId}/share-links")
    public List<ShareLinkListResponse> listShareLinks(@PathVariable("galleryId") String galleryId) {
        return shareLinkFacade.listShareLinks(galleryId).stream()
                .map(view -> new ShareLinkListResponse(
                        view.id().toString(),
                        view.galleryId().toString(),
                        view.status().name(),
                        view.expiresAt(),
                        view.lastAccessedAt(),
                        view.createdAt()
                ))
                .toList();
    }

    /**
     * 撤销分享链接
     */
    @DeleteMapping("/api/share-links/{shareLinkId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeShareLink(@PathVariable("shareLinkId") String shareLinkId) {
        shareLinkFacade.revokeShareLink(shareLinkId);
    }

    /**
     * 为已有分享链接生成短链接
     */
    @PostMapping("/api/share-links/{shareLinkId}/short-url")
    public GenerateShortLinkResponse generateShortLink(@PathVariable("shareLinkId") String shareLinkId) {
        CreateShortUrlResult result = shareLinkFacade.createShortUrl(shareLinkId);
        return new GenerateShortLinkResponse(
                result.shortCode(),
                result.shortUrl()
        );
    }

    /**
     * 解析短码（用于前端预览或 API 查询）
     */
    @GetMapping("/api/short-links/{shortCode}")
    public ResolveShortLinkResponse resolveShortLink(@PathVariable("shortCode") String shortCode) {
        ShortLinkTarget target = shareLinkFacade.resolveShortLink(shortCode);
        return new ResolveShortLinkResponse(
                target.shortCode(),
                target.fullUrl(),
                target.gallerySlug()
        );
    }

    /**
     * 生成分享链接二维码（微信扫码分享用）
     */
    @GetMapping("/api/share-links/{shareLinkId}/qrcode")
    public ResponseEntity<byte[]> generateQrCode(@PathVariable("shareLinkId") String shareLinkId) {
        GenerateShareLinkQrResult result = shareLinkFacade.generateQrCode(shareLinkId);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .cacheControl(CacheControl.noStore())
                .body(result.pngBytes());
    }

    /**
     * 生成分享海报
     */
    @PostMapping("/api/galleries/{galleryId}/share-poster")
    public GenerateSharePosterResponse generateSharePoster(
            @PathVariable("galleryId") String galleryId,
            @Valid @RequestBody(required = false) GenerateSharePosterRequest request
    ) {
        GenerateSharePosterResult result = shareLinkFacade.generateSharePoster(posterCommand(galleryId, request));
        return new GenerateSharePosterResponse(result.posterUrl(), result.template());
    }

    @PostMapping(value = "/api/galleries/{galleryId}/share-poster/preview", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> previewSharePoster(@PathVariable("galleryId") String galleryId,
            @RequestBody(required = false) GenerateSharePosterRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.IMAGE_PNG)
                .body(shareLinkFacade.previewSharePoster(posterCommand(galleryId, request)));
    }

    @PostMapping(value = "/api/galleries/{galleryId}/share-poster/download", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> downloadSharePoster(@PathVariable("galleryId") String galleryId,
            @RequestBody(required = false) GenerateSharePosterRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.IMAGE_PNG)
                .header("Content-Disposition", "attachment; filename=gallery-poster.png")
                .body(shareLinkFacade.downloadSharePoster(posterCommand(galleryId, request)));
    }

    private GenerateSharePosterCommand posterCommand(String galleryId, GenerateSharePosterRequest request) {
        return request == null ? new GenerateSharePosterCommand(galleryId, null)
                : new GenerateSharePosterCommand(galleryId, request.template(), request.format(),
                    request.title(), request.description(), request.focalPoint());
    }

    // Request & Response records

    public record CreateShareLinkRequest(Instant expiresAt) {}

    public record CreateShareLinkResponse(
            String id,
            String galleryId,
            Instant expiresAt,
            Instant createdAt,
            String status,
            String shareUrl,
            String rawToken
    ) {}

    public record ShareLinkListResponse(
            String id,
            String galleryId,
            String status,
            Instant expiresAt,
            Instant lastAccessedAt,
            Instant createdAt
    ) {}

    public record GenerateSharePosterRequest(String template, String format, String title,
                                              String description, Integer focalPoint) {}

    public record GenerateSharePosterResponse(
            String posterUrl,
            String template
    ) {}

    public record GenerateShortLinkResponse(
            String shortCode,
            String shortUrl
    ) {}

    public record ResolveShortLinkResponse(
            String shortCode,
            String fullUrl,
            String gallerySlug
    ) {}
}
