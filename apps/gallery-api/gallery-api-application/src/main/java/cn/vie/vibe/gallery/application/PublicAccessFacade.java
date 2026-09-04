package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 公开访问门面，处理公开展示和密码解锁逻辑
 */
public class PublicAccessFacade {
    private final GalleryRepository galleryRepository;
    private final ShareLinkRepository shareLinkRepository;
    private final PhotoRepository photoRepository;
    private final StorageObjectRepository storageObjectRepository;
    private final ObjectStoragePort objectStoragePort;
    private final PasswordHasher passwordHasher;
    private final TokenGenerator tokenGenerator;

    public PublicAccessFacade(
            GalleryRepository galleryRepository,
            ShareLinkRepository shareLinkRepository,
            PhotoRepository photoRepository,
            StorageObjectRepository storageObjectRepository,
            ObjectStoragePort objectStoragePort,
            PasswordHasher passwordHasher,
            TokenGenerator tokenGenerator
    ) {
        this.galleryRepository = galleryRepository;
        this.shareLinkRepository = shareLinkRepository;
        this.photoRepository = photoRepository;
        this.storageObjectRepository = storageObjectRepository;
        this.objectStoragePort = objectStoragePort;
        this.passwordHasher = passwordHasher;
        this.tokenGenerator = tokenGenerator;
    }

    /**
     * 解析公开相册状态
     */
    public PublicGalleryView resolvePublicGallery(String slug, String shareToken) {
        Gallery gallery = galleryRepository.findBySlug(slug)
                .filter(g -> !g.deleted())
                .orElseThrow(PublicAccessException::galleryNotFound);

        Instant now = Instant.now();

        // 根据可见性决定访问状态
        PublicAccessState accessState = determineAccessState(gallery, shareToken, now);

        // 获取照片数量
        int photoCount = photoRepository.countByGalleryId(gallery.id());

        // 获取封面
        PublicGalleryView.CoverView cover = null;
        if (gallery.coverPhotoId() != null) {
            cover = photoRepository.findById(gallery.coverPhotoId())
                    .filter(p -> p.status() == PhotoStatus.READY)
                    .flatMap(photo -> storageObjectRepository.findById(gallery.tenantId(), photo.storageObjectId()))
                    .map(storageObject -> {
                        String key = storageObject.thumbnailKey() != null ? storageObject.thumbnailKey() : storageObject.objectKey();
                        String url = objectStoragePort.createReadUrl(key).toString();
                        return new PublicGalleryView.CoverView(url, storageObject.width(), storageObject.height());
                    })
                    .orElse(null);
        }

        return new PublicGalleryView(
                gallery.slug(),
                gallery.name(),
                gallery.visibility(),
                accessState,
                cover,
                photoCount
        );
    }

    /**
     * 解锁密码相册
     */
    public void unlockGallery(String slug, String shareToken, String password) {
        Gallery gallery = galleryRepository.findBySlug(slug)
                .filter(g -> !g.deleted())
                .orElseThrow(PublicAccessException::galleryNotFound);

        // 验证可见性
        if (gallery.visibility() != GalleryVisibility.PASSWORD) {
            throw new DomainException("INVALID_OPERATION", "Gallery does not require password");
        }

        // 验证分享链接
        Instant now = Instant.now();
        ShareLink shareLink = validateShareToken(shareToken, gallery.id(), now);

        // 验证密码
        if (gallery.passwordHash() == null || !passwordHasher.matches(password, gallery.passwordHash())) {
            throw PublicAccessException.passwordInvalid();
        }

        // 密码验证成功，由调用方创建公开访问 Session
    }

    /**
     * 列出公开照片
     */
    public List<PublicPhotoView> listPublicPhotos(
            String slug,
            String shareToken,
            UUID publicSessionGalleryId,
            int page,
            int pageSize
    ) {
        Gallery gallery = galleryRepository.findBySlug(slug)
                .filter(g -> !g.deleted())
                .orElseThrow(PublicAccessException::galleryNotFound);

        Instant now = Instant.now();

        // 验证访问权限
        validatePublicAccess(gallery, shareToken, publicSessionGalleryId, now);

        // 限制分页大小
        int effectivePageSize = Math.min(pageSize, 100);
        int offset = page * effectivePageSize;

        // 查询照片
        List<Photo> photos = photoRepository.findByGalleryIdWithPagination(
                gallery.id(),
                offset,
                effectivePageSize
        );

        // 转换为公开视图
        return photos.stream()
                .filter(p -> p.status() == PhotoStatus.READY)
                .map(photo -> storageObjectRepository.findById(gallery.tenantId(), photo.storageObjectId())
                        .map(storageObject -> {
                            String key = storageObject.thumbnailKey() != null ? storageObject.thumbnailKey() : storageObject.objectKey();
                            String thumbnailUrl = objectStoragePort.createReadUrl(key).toString();
                            return new PublicPhotoView(
                                    photo.title(),
                                    thumbnailUrl,
                                    storageObject.width(),
                                    storageObject.height(),
                                    photo.sortOrder()
                            );
                        })
                        .orElse(null)
                )
                .filter(view -> view != null)
                .toList();
    }

    /**
     * 确定访问状态
     */
    private PublicAccessState determineAccessState(Gallery gallery, String shareToken, Instant now) {
        return switch (gallery.visibility()) {
            case PUBLIC -> PublicAccessState.READY;
            case PRIVATE -> {
                // PRIVATE 需要有效的分享链接
                if (shareToken == null || shareToken.isBlank()) {
                    yield PublicAccessState.SHARE_LINK_REQUIRED;
                }
                try {
                    validateShareToken(shareToken, gallery.id(), now);
                    yield PublicAccessState.READY;
                } catch (PublicAccessException e) {
                    yield PublicAccessState.SHARE_LINK_REQUIRED;
                }
            }
            case PASSWORD -> PublicAccessState.PASSWORD_REQUIRED;
        };
    }

    /**
     * 验证分享 token
     */
    private ShareLink validateShareToken(String shareToken, UUID galleryId, Instant now) {
        if (shareToken == null || shareToken.isBlank()) {
            throw PublicAccessException.shareLinkRequired();
        }

        String tokenHash = tokenGenerator.hashToken(shareToken);
        ShareLink shareLink = shareLinkRepository.findByTokenHash(tokenHash)
                .orElseThrow(PublicAccessException::shareLinkInvalid);

        // 验证链接属于该相册
        if (!shareLink.getGalleryId().equals(galleryId)) {
            throw PublicAccessException.shareLinkInvalid();
        }

        // 验证链接状态
        if (shareLink.isRevoked()) {
            throw PublicAccessException.shareLinkRevoked();
        }
        if (shareLink.isExpired(now)) {
            throw PublicAccessException.shareLinkExpired();
        }

        return shareLink;
    }

    /**
     * 验证公开访问权限
     */
    private void validatePublicAccess(
            Gallery gallery,
            String shareToken,
            UUID publicSessionGalleryId,
            Instant now
    ) {
        switch (gallery.visibility()) {
            case PUBLIC -> {
                // PUBLIC 相册无需验证
            }
            case PRIVATE -> {
                // PRIVATE 相册需要有效的分享链接
                validateShareToken(shareToken, gallery.id(), now);
            }
            case PASSWORD -> {
                // PASSWORD 相册需要有效的公开访问 Session
                if (publicSessionGalleryId == null || !publicSessionGalleryId.equals(gallery.id())) {
                    throw PublicAccessException.sessionExpired();
                }
            }
        }
    }
}
