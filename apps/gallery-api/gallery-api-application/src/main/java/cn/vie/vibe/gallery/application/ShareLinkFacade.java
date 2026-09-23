package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 分享链接管理门面
 */
public class ShareLinkFacade {
    private final ShareLinkRepository shareLinkRepository;
    private final GalleryRepository galleryRepository;
    private final PhotoRepository photoRepository;
    private final StorageObjectRepository storageObjectRepository;
    private final ObjectStoragePort objectStoragePort;
    private final TokenGenerator tokenGenerator;
    private final String publicBaseUrl;
    private final WorkspaceAuthorizationPolicy authorization;
    private final ShortCodeGenerator shortCodeGenerator = new ShortCodeGenerator();
    private final SharePosterService sharePosterService;

    public ShareLinkFacade(
            ShareLinkRepository shareLinkRepository,
            GalleryRepository galleryRepository,
            PhotoRepository photoRepository,
            StorageObjectRepository storageObjectRepository,
            ObjectStoragePort objectStoragePort,
            TokenGenerator tokenGenerator,
            String publicBaseUrl,
            SharePosterService sharePosterService
    ) {
        this(shareLinkRepository, galleryRepository, photoRepository, storageObjectRepository,
                objectStoragePort, tokenGenerator, publicBaseUrl, sharePosterService,
                new WorkspaceAuthorizationPolicy(TenantContextHolder::current));
    }

    public ShareLinkFacade(
            ShareLinkRepository shareLinkRepository,
            GalleryRepository galleryRepository,
            PhotoRepository photoRepository,
            StorageObjectRepository storageObjectRepository,
            ObjectStoragePort objectStoragePort,
            TokenGenerator tokenGenerator,
            String publicBaseUrl,
            SharePosterService sharePosterService,
            WorkspaceAuthorizationPolicy authorization
    ) {
        this.shareLinkRepository = shareLinkRepository;
        this.galleryRepository = galleryRepository;
        this.photoRepository = photoRepository;
        this.storageObjectRepository = storageObjectRepository;
        this.objectStoragePort = objectStoragePort;
        this.tokenGenerator = tokenGenerator;
        this.publicBaseUrl = publicBaseUrl;
        this.sharePosterService = sharePosterService;
        this.authorization = authorization;
    }

    /**
     * 创建分享链接
     */
    public CreateShareLinkResult createShareLink(CreateShareLinkCommand command) {
        TenantContext context = authorization.requireOwner();
        UUID galleryId = UUID.fromString(command.galleryId());

        // 验证相册属于当前租户
        Gallery gallery = galleryRepository.findById(galleryId)
                .filter(g -> g.tenantId().equals(context.tenantId()))
                .filter(g -> !g.deleted())
                .filter(g -> g.status() == GalleryStatus.PUBLISHED)
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));

        // 生成 token 和 hash
        String rawToken = tokenGenerator.generateToken();
        String tokenHash = tokenGenerator.hashToken(rawToken);

        // 创建分享链接（保存 rawToken 用于短链接重定向）
        Instant now = Instant.now();
        ShareLink shareLink = new ShareLink(
                UUID.randomUUID(),
                galleryId,
                tokenHash,
                null,  // shortCode 稍后通过 generateShortLink 生成
                rawToken,  // 保存原始 token
                command.expiresAt(),
                null,
                null,
                now,
                now
        );

        shareLinkRepository.save(shareLink);

        // 构建分享 URL
        String shareUrl = String.format("%s/g/%s?t=%s", publicBaseUrl, gallery.slug(), rawToken);

        return new CreateShareLinkResult(
                shareLink.getId(),
                shareLink.getGalleryId(),
                shareLink.getExpiresAt(),
                shareLink.getCreatedAt(),
                "ACTIVE",
                shareUrl,
                rawToken
        );
    }

    /**
     * 列出相册的分享链接
     */
    public List<ShareLinkView> listShareLinks(String galleryId) {
        TenantContext context = authorization.requireOwner();
        UUID gId = UUID.fromString(galleryId);

        // 验证相册属于当前租户
        galleryRepository.findById(gId)
                .filter(g -> g.tenantId().equals(context.tenantId()))
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));

        List<ShareLink> links = shareLinkRepository.findByGalleryIdAndTenantId(gId, context.tenantId());
        Instant now = Instant.now();

        return links.stream()
                .map(link -> new ShareLinkView(
                        link.getId(),
                        link.getGalleryId(),
                        link.getStatus(now),
                        link.getExpiresAt(),
                        link.getLastAccessedAt(),
                        link.getCreatedAt()
                ))
                .toList();
    }

    /**
     * 撤销分享链接
     */
    public void revokeShareLink(String shareLinkId) {
        TenantContext context = authorization.requireOwner();
        UUID linkId = UUID.fromString(shareLinkId);

        ShareLink shareLink = shareLinkRepository.findById(linkId)
                .orElseThrow(() -> new DomainException("SHARE_LINK_NOT_FOUND", "Share link not found"));

        // 跨租户统一返回 NOT_FOUND，避免泄露链接存在性
        galleryRepository.findById(shareLink.getGalleryId())
                .filter(g -> g.tenantId().equals(context.tenantId()))
                .orElseThrow(() -> new DomainException("SHARE_LINK_NOT_FOUND", "Share link not found"));

        // 创建新的已撤销状态
        Instant now = Instant.now();
        ShareLink revokedLink = new ShareLink(
                shareLink.getId(),
                shareLink.getGalleryId(),
                shareLink.getTokenHash(),
                shareLink.getShortCode(),
                shareLink.getExpiresAt(),
                now, // 设置撤销时间
                shareLink.getLastAccessedAt(),
                shareLink.getCreatedAt(),
                now
        );

        shareLinkRepository.update(revokedLink);
    }

    /**
     * 删除分享链接
     */
    public void deleteShareLink(String shareLinkId) {
        TenantContext context = authorization.requireOwner();
        UUID linkId = UUID.fromString(shareLinkId);

        ShareLink shareLink = shareLinkRepository.findById(linkId)
                .orElseThrow(() -> new DomainException("SHARE_LINK_NOT_FOUND", "Share link not found"));

        // 跨租户统一返回 NOT_FOUND，避免泄露链接存在性
        galleryRepository.findById(shareLink.getGalleryId())
                .filter(g -> g.tenantId().equals(context.tenantId()))
                .orElseThrow(() -> new DomainException("SHARE_LINK_NOT_FOUND", "Share link not found"));

        shareLinkRepository.delete(linkId);
    }

    /**
     * 为现有分享链接生成短码
     */
    public CreateShortUrlResult generateShortLink(String shareLinkId) {
        return createShortUrl(shareLinkId);
    }

    /**
     * 生成唯一短码（带重试）
     */
    private String generateUniqueShortCode() {
        int maxRetries = 5;
        for (int i = 0; i < maxRetries; i++) {
            String candidate = shortCodeGenerator.generateShortCode();
            if (shareLinkRepository.findByShortCode(candidate).isEmpty()) {
                return candidate;
            }
        }
        throw new DomainException("SHORT_CODE_GENERATION_FAILED", "Failed to generate unique short code after retries");
    }

    /**
     * 生成分享海报
     */
    public GenerateSharePosterResult generateSharePoster(GenerateSharePosterCommand command) {
        TenantContext context = authorization.requireOwner();
        UUID galleryId = UUID.fromString(command.galleryId());

        // 验证相册属于当前租户且已发布
        Gallery gallery = galleryRepository.findById(galleryId)
                .filter(g -> g.tenantId().equals(context.tenantId()))
                .filter(g -> !g.deleted())
                .filter(g -> g.status() == GalleryStatus.PUBLISHED)
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found or not published"));

        // 获取封面照片URL
        String coverUrl = null;
        if (gallery.coverPhotoId() != null) {
            Photo coverPhoto = photoRepository.findById(gallery.coverPhotoId())
                    .orElse(null);
            if (coverPhoto != null && coverPhoto.status() == PhotoStatus.READY) {
                // 使用缩略图URL（需要从StorageObject获取）
                coverUrl = buildPhotoUrl(coverPhoto);
            }
        }

        // 如果没有封面，使用第一张就绪的照片
        if (coverUrl == null) {
            List<Photo> photos = photoRepository.findByGalleryIdWithPagination(galleryId, 0, 10);
            coverUrl = photos.stream()
                    .filter(p -> p.status() == PhotoStatus.READY)
                    .findFirst()
                    .map(this::buildPhotoUrl)
                    .orElse(null);
        }

        if (coverUrl == null) {
            throw new DomainException("NO_COVER_PHOTO", "Gallery has no available photos for poster");
        }

        // 统计照片数量
        int photoCount = photoRepository.countByGalleryId(galleryId);

        // 构建分享URL
        String shareUrl = String.format("%s/g/%s", publicBaseUrl, gallery.slug());

        // 生成海报
        SharePosterService.GalleryInfo galleryInfo = new SharePosterService.GalleryInfo(
                gallery.id().toString(),
                gallery.name(),
                null, // 暂时没有描述字段
                coverUrl,
                photoCount
        );

        SharePosterService.PosterTemplate template = command.template() != null
                ? SharePosterService.PosterTemplate.valueOf(command.template().toUpperCase())
                : SharePosterService.PosterTemplate.MINIMAL;

        String posterUrl = sharePosterService.generatePoster(galleryInfo, shareUrl, template);

        return new GenerateSharePosterResult(posterUrl, template.name());
    }

    private String buildPhotoUrl(Photo photo) {
        // 从 StorageObject 获取真实的图片 URL
        return storageObjectRepository.findById(photo.tenantId(), photo.storageObjectId())
                .filter(object -> object.status() == StorageObjectStatus.READY)
                .map(object -> {
                    String key = object.thumbnailKey() != null ? object.thumbnailKey() : object.objectKey();
                    return objectStoragePort.createReadUrl(key, ObjectStoragePort.DEFAULT_READ_URL_TTL).toString();
                })
                .orElse(null);
    }

    /**
     * 为已有分享链接生成短链接（幂等，可重复调用）
     */
    public CreateShortUrlResult createShortUrl(String shareLinkId) {
        TenantContext context = authorization.requireOwner();
        UUID linkId = UUID.fromString(shareLinkId);

        ShareLink shareLink = shareLinkRepository.findById(linkId)
                .orElseThrow(() -> new DomainException("SHARE_LINK_NOT_FOUND", "Share link not found"));

        // 跨租户统一返回 NOT_FOUND
        Gallery gallery = galleryRepository.findById(shareLink.getGalleryId())
                .filter(g -> g.tenantId().equals(context.tenantId()))
                .orElseThrow(() -> new DomainException("SHARE_LINK_NOT_FOUND", "Share link not found"));

        Instant now = Instant.now();
        String rawToken = shareLink.getRawToken();

        // 短链接功能上线前的历史链接没有保存原始 token，无法完成 /s/{code} 重定向；
        // 为其轮换新 token（旧长链接随之失效），否则生成的短码会指向死链
        if (rawToken == null || rawToken.isBlank()) {
            rawToken = tokenGenerator.generateToken();
            shareLinkRepository.rotateToken(shareLink.getId(), tokenGenerator.hashToken(rawToken), rawToken, now);
        }

        // 如果已有短码，直接返回
        if (shareLink.getShortCode() != null) {
            String shortUrl = String.format("%s/s/%s", publicBaseUrl, shareLink.getShortCode());
            return new CreateShortUrlResult(shareLink.getId(), shareLink.getShortCode(), shortUrl);
        }

        // 生成短码（重试机制处理冲突）
        String shortCode = generateUniqueShortCode();
        shareLinkRepository.assignShortCode(linkId, shortCode, now);

        String shortUrl = String.format("%s/s/%s", publicBaseUrl, shortCode);
        return new CreateShortUrlResult(shareLink.getId(), shortCode, shortUrl);
    }

    /**
     * 解析短码到完整的分享链接 URL（供公开重定向控制器使用）
     * 
     * 短码重定向到带原始 token 的完整 URL：/g/{slug}?t={rawToken}
     */
    public ShortLinkTarget resolveShortLink(String shortCode) {
        ShareLink shareLink = shareLinkRepository.findByShortCode(shortCode)
                .orElseThrow(() -> new DomainException("SHORT_LINK_NOT_FOUND", "Short link not found"));

        // 验证链接是否有效
        Instant now = Instant.now();
        if (!shareLink.isValid(now)) {
            throw new DomainException("SHORT_LINK_INVALID", "Short link is expired or revoked");
        }

        // 检查是否有原始 token
        if (shareLink.getRawToken() == null || shareLink.getRawToken().isBlank()) {
            throw new DomainException("SHORT_LINK_INVALID", "Short link missing raw token");
        }

        Gallery gallery = galleryRepository.findById(shareLink.getGalleryId())
                .filter(g -> !g.deleted())
                .filter(g -> g.status() == GalleryStatus.PUBLISHED)
                .orElseThrow(() -> new DomainException("GALLERY_NOT_FOUND", "Gallery not found"));

        // 更新最后访问时间（节流：5分钟内不重复更新）
        Instant threshold = now.minusSeconds(300);
        shareLinkRepository.touchLastAccessed(shareLink.getId(), now, threshold);

        // 构造带原始 token 的完整 URL
        String targetUrl = String.format("%s/g/%s?t=%s", publicBaseUrl, gallery.slug(), shareLink.getRawToken());
        return new ShortLinkTarget(targetUrl, gallery.slug(), shortCode);
    }

}
