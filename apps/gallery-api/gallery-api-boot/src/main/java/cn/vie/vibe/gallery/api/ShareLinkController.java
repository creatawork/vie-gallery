package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.CreateShareLinkCommand;
import cn.vie.vibe.gallery.application.CreateShareLinkResult;
import cn.vie.vibe.gallery.application.CreateShortUrlResult;
import cn.vie.vibe.gallery.application.GenerateSharePosterCommand;
import cn.vie.vibe.gallery.application.GenerateSharePosterResult;
import cn.vie.vibe.gallery.application.ShareLinkFacade;
import cn.vie.vibe.gallery.application.ShareLinkView;
import cn.vie.vibe.gallery.application.ShortLinkTarget;
import cn.vie.vibe.gallery.domain.ShareLinkStatus;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
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
     * 生成分享海报
     */
    @PostMapping("/api/galleries/{galleryId}/share-poster")
    public GenerateSharePosterResponse generateSharePoster(
            @PathVariable("galleryId") String galleryId,
            @Valid @RequestBody(required = false) GenerateSharePosterRequest request
    ) {
        try {
            String template = request != null && request.template() != null
                    ? request.template()
                    : "MINIMAL";

            GenerateSharePosterCommand command = new GenerateSharePosterCommand(galleryId, template);
            GenerateSharePosterResult result = shareLinkFacade.generateSharePoster(command);

            return new GenerateSharePosterResponse(
                    result.posterUrl(),
                    result.template()
            );
        } catch (Exception e) {
            // 记录详细错误日志
            System.err.println("Failed to generate poster for gallery " + galleryId + ": " + e.getMessage());
            e.printStackTrace();
            throw e;
        }
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

    public record GenerateSharePosterRequest(String template) {}

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
