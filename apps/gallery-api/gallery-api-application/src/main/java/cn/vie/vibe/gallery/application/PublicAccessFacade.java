package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.*;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 公开访问门面，处理公开展示和密码解锁逻辑。
 */
public class PublicAccessFacade {
    private static final int MAX_PAGE_SIZE = 100;
    private static final Duration SHARE_LINK_TOUCH_INTERVAL = Duration.ofMinutes(5);

    private final GalleryRepository galleryRepository;
    private final ShareLinkRepository shareLinkRepository;
    private final PhotoRepository photoRepository;
    private final StorageObjectRepository storageObjectRepository;
    private final ObjectStoragePort objectStoragePort;
    private final PasswordHasher passwordHasher;
    private final PhotoAssetVariantRepository assetVariants;
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
        this(galleryRepository, shareLinkRepository, photoRepository, storageObjectRepository,
                objectStoragePort, passwordHasher, tokenGenerator, null);
    }

    public PublicAccessFacade(
            GalleryRepository galleryRepository,
            ShareLinkRepository shareLinkRepository,
            PhotoRepository photoRepository,
            StorageObjectRepository storageObjectRepository,
            ObjectStoragePort objectStoragePort,
            PasswordHasher passwordHasher,
            TokenGenerator tokenGenerator,
            PhotoAssetVariantRepository assetVariants
    ) {
        this.galleryRepository = galleryRepository;
        this.shareLinkRepository = shareLinkRepository;
        this.photoRepository = photoRepository;
        this.storageObjectRepository = storageObjectRepository;
        this.objectStoragePort = objectStoragePort;
        this.passwordHasher = passwordHasher;
        this.tokenGenerator = tokenGenerator;
        this.assetVariants = assetVariants;
    }

    /**
     * 解析公开相册状态。
     */
    public PublicGalleryView resolvePublicGallery(String slug, String shareToken) {
        return resolvePublicGallery(slug, shareToken, null);
    }

    public PublicGalleryView resolvePublicGallery(String slug, String shareToken, UUID publicSessionGalleryId) {
        Gallery gallery = findGallery(slug);
        Instant now = Instant.now();
        PublicAccessState accessState = determineAccessState(gallery, shareToken, publicSessionGalleryId, now);
        boolean canExposePhotos = accessState == PublicAccessState.READY;
        int photoCount = canExposePhotos
                ? photoRepository.countPublicReadyByGalleryId(gallery.tenantId(), gallery.id())
                : 0;

        return new PublicGalleryView(
                gallery.slug(),
                gallery.name(),
                gallery.visibility(),
                accessState,
                canExposePhotos ? findCover(gallery) : null,
                photoCount
        );
    }

    /**
     * 解锁密码相册，并返回真实的相册 ID 供 Controller 创建 gallery-scoped Session。
     */
    public UUID unlockGallery(String slug, String shareToken, String password) {
        Gallery gallery = findGallery(slug);

        if (gallery.visibility() != GalleryVisibility.PASSWORD) {
            throw new DomainException("INVALID_OPERATION", "Gallery does not require password");
        }

        validateShareToken(shareToken, gallery.id(), Instant.now());
        if (gallery.passwordHash() == null || !passwordHasher.matches(password, gallery.passwordHash())) {
            throw PublicAccessException.passwordInvalid();
        }

        return gallery.id();
    }

    /**
     * 验证公开 Viewer 配置的访问权限。
     */
    public void validateViewerConfigAccess(String slug, String shareToken, UUID publicSessionGalleryId) {
        Gallery gallery = findGallery(slug);
        validatePublicAccess(gallery, shareToken, publicSessionGalleryId, Instant.now());
    }

    /**
     * 列出公开照片。READY 过滤和 total 由 Repository/Facade 统一保证。
     */
    public PublicPhotoPage listPublicPhotos(
            String slug,
            String shareToken,
            UUID publicSessionGalleryId,
            int page,
            int pageSize
    ) {
        validatePage(page, pageSize);
        Gallery gallery = findGallery(slug);
        validatePublicAccess(gallery, shareToken, publicSessionGalleryId, Instant.now());

        long offsetLong = (long) page * pageSize;
        if (offsetLong > Integer.MAX_VALUE) {
            throw new DomainException("INVALID_PAGE", "Page is out of range");
        }

        int total = photoRepository.countPublicReadyByGalleryId(gallery.tenantId(), gallery.id());
        List<Photo> photos = photoRepository.findPublicReadyByGalleryId(
                gallery.tenantId(),
                gallery.id(),
                (int) offsetLong,
                pageSize
        );

        List<PublicPhotoView> items = photos.stream()
                .map(photo -> toPublicPhoto(gallery, photo))
                .flatMap(Optional::stream)
                .toList();

        return new PublicPhotoPage(items, page, pageSize, total);
    }

    private Gallery findGallery(String slug) {
        return galleryRepository.findBySlug(slug)
                .filter(g -> !g.deleted())
                .filter(g -> g.status() == GalleryStatus.PUBLISHED)
                .orElseThrow(PublicAccessException::galleryNotFound);
    }

    private PublicGalleryView.CoverView findCover(Gallery gallery) {
        if (gallery.coverPhotoId() != null) {
            Optional<PublicGalleryView.CoverView> explicit = photoRepository.findById(gallery.tenantId(), gallery.coverPhotoId())
                    .filter(photo -> photo.galleryId().equals(gallery.id()))
                    .filter(photo -> photo.status() == PhotoStatus.READY)
                    .flatMap(photo -> toCover(gallery, photo));
            if (explicit.isPresent()) return explicit.get();
        }

        return photoRepository.findByGallery(gallery.tenantId(), gallery.id()).stream()
                .filter(photo -> photo.status() == PhotoStatus.READY && photo.cover())
                .map(photo -> toCover(gallery, photo))
                .flatMap(Optional::stream)
                .findFirst()
                .orElse(null);
    }

    private Optional<PublicGalleryView.CoverView> toCover(Gallery gallery, Photo photo) {
        return storageObjectRepository.findById(gallery.tenantId(), photo.storageObjectId())
                .filter(object -> object.status() == StorageObjectStatus.READY)
                .map(object -> {
                    String key = object.thumbnailKey() != null ? object.thumbnailKey() : object.objectKey();
                    return new PublicGalleryView.CoverView(
                            objectStoragePort.createReadUrl(key, ObjectStoragePort.DEFAULT_READ_URL_TTL).toString(),
                            object.width() == null ? 0 : object.width(),
                            object.height() == null ? 0 : object.height()
                    );
                });
    }

    private Optional<PublicPhotoView> toPublicPhoto(Gallery gallery, Photo photo) {
        return storageObjectRepository.findById(gallery.tenantId(), photo.storageObjectId())
                .filter(object -> object.status() == StorageObjectStatus.READY)
                .map(object -> {
                    String key = object.thumbnailKey() != null ? object.thumbnailKey() : object.objectKey();
                    String mediumUrl = assetVariants == null ? null : assetVariants.findReadyByPhotoAndKind(
                            gallery.tenantId(), photo.id(), VariantKind.MEDIUM)
                            .map(variant -> objectStoragePort.createReadUrl(variant.objectKey(), ObjectStoragePort.DEFAULT_READ_URL_TTL).toString())
                            .orElse(null);
                    String textureUrl = assetVariants == null ? null : assetVariants.findReadyByPhotoAndKind(
                            gallery.tenantId(), photo.id(), VariantKind.TEXTURE)
                            .map(variant -> objectStoragePort.createReadUrl(variant.objectKey(), ObjectStoragePort.DEFAULT_READ_URL_TTL).toString())
                            .orElse(null);
                    return new PublicPhotoView(
                            photo.title(),
                            objectStoragePort.createReadUrl(key, ObjectStoragePort.DEFAULT_READ_URL_TTL).toString(),
                            object.width() == null ? 0 : object.width(),
                            object.height() == null ? 0 : object.height(),
                            photo.sortOrder(), mediumUrl, textureUrl
                    );
                });
    }

    private void validatePage(int page, int pageSize) {
        if (page < 0) {
            throw new DomainException("INVALID_PAGE", "Page must be greater than or equal to zero");
        }
        if (pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
            throw new DomainException("INVALID_PAGE_SIZE", "Page size must be between 1 and 100");
        }
    }

    private PublicAccessState determineAccessState(Gallery gallery, String shareToken, UUID publicSessionGalleryId, Instant now) {
        return switch (gallery.visibility()) {
            case PUBLIC -> PublicAccessState.READY;
            case PRIVATE -> {
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
            case PASSWORD -> {
                if (publicSessionGalleryId != null && publicSessionGalleryId.equals(gallery.id())) {
                    yield PublicAccessState.READY;
                }
                yield PublicAccessState.PASSWORD_REQUIRED;
            }
        };
    }

    private ShareLink validateShareToken(String shareToken, UUID galleryId, Instant now) {
        if (shareToken == null || shareToken.isBlank()) {
            throw PublicAccessException.shareLinkRequired();
        }

        String tokenHash = tokenGenerator.hashToken(shareToken);
        ShareLink shareLink = shareLinkRepository.findByTokenHash(tokenHash)
                .orElseThrow(PublicAccessException::shareLinkInvalid);

        if (!shareLink.getGalleryId().equals(galleryId)) {
            throw PublicAccessException.shareLinkInvalid();
        }
        if (shareLink.isRevoked()) {
            throw PublicAccessException.shareLinkRevoked();
        }
        if (shareLink.isExpired(now)) {
            throw PublicAccessException.shareLinkExpired();
        }

        // 记录最近访问，只有上次访问早于节流阈值时才写库。
        shareLinkRepository.touchLastAccessed(shareLink.getId(), now, now.minus(SHARE_LINK_TOUCH_INTERVAL));
        return shareLink;
    }

    private void validatePublicAccess(
            Gallery gallery,
            String shareToken,
            UUID publicSessionGalleryId,
            Instant now
    ) {
        switch (gallery.visibility()) {
            case PUBLIC -> {
                // PUBLIC 相册无需验证。
            }
            case PRIVATE -> validateShareToken(shareToken, gallery.id(), now);
            case PASSWORD -> {
                if (publicSessionGalleryId == null || !publicSessionGalleryId.equals(gallery.id())) {
                    throw PublicAccessException.sessionExpired();
                }
            }
        }
    }
}
