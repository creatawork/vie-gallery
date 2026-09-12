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
    private final TokenGenerator tokenGenerator;
    private final String publicBaseUrl;
    private final WorkspaceAuthorizationPolicy authorization;

    public ShareLinkFacade(
            ShareLinkRepository shareLinkRepository,
            GalleryRepository galleryRepository,
            TokenGenerator tokenGenerator,
            String publicBaseUrl
    ) {
        this(shareLinkRepository, galleryRepository, tokenGenerator, publicBaseUrl,
                new WorkspaceAuthorizationPolicy(TenantContextHolder::current));
    }

    public ShareLinkFacade(
            ShareLinkRepository shareLinkRepository,
            GalleryRepository galleryRepository,
            TokenGenerator tokenGenerator,
            String publicBaseUrl,
            WorkspaceAuthorizationPolicy authorization
    ) {
        this.shareLinkRepository = shareLinkRepository;
        this.galleryRepository = galleryRepository;
        this.tokenGenerator = tokenGenerator;
        this.publicBaseUrl = publicBaseUrl;
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

        // 创建分享链接
        Instant now = Instant.now();
        ShareLink shareLink = new ShareLink(
                UUID.randomUUID(),
                galleryId,
                tokenHash,
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
}
