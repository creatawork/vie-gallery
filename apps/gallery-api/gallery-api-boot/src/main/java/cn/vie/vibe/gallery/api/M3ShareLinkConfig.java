package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.*;
import cn.vie.vibe.gallery.infrastructure.Sha256TokenGenerator;
import cn.vie.vibe.gallery.infrastructure.persistence.MyBatisShareLinkRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * M3 配置：分享链接、公开访问和 3D 视觉展示配置
 */
@Configuration
public class M3ShareLinkConfig {

    @Bean
    public QRCodeGenerator qrCodeGenerator() {
        return new QRCodeGenerator();
    }

    @Bean
    public SharePosterService sharePosterService(
            ObjectStoragePort objectStoragePort,
            QRCodeGenerator qrCodeGenerator
    ) {
        return new SharePosterService(objectStoragePort, qrCodeGenerator);
    }

    @Bean
    public ShareLinkFacade shareLinkFacade(
            ShareLinkRepository shareLinkRepository,
            GalleryRepository galleryRepository,
            PhotoRepository photoRepository,
            TokenGenerator tokenGenerator,
            @Value("${gallery.public.base-url:http://localhost:5174}") String publicBaseUrl,
            SharePosterService sharePosterService,
            WorkspaceAuthorizationPolicy authorization
    ) {
        return new ShareLinkFacade(
                shareLinkRepository,
                galleryRepository,
                photoRepository,
                tokenGenerator,
                publicBaseUrl,
                sharePosterService,
                authorization
        );
    }

    @Bean
    public PublicAccessFacade publicAccessFacade(
            GalleryRepository galleryRepository,
            ShareLinkRepository shareLinkRepository,
            PhotoRepository photoRepository,
            StorageObjectRepository storageObjectRepository,
            ObjectStoragePort objectStoragePort,
            PasswordHasher passwordHasher,
            TokenGenerator tokenGenerator,
            PhotoAssetVariantRepository assetVariants,
            CreatorPreviewTokens previewTokens,
            ViewerConfigVersionRepository viewerConfigVersionRepository
    ) {
        return new PublicAccessFacade(
                galleryRepository,
                shareLinkRepository,
                photoRepository,
                storageObjectRepository,
                objectStoragePort,
                passwordHasher,
                tokenGenerator,
                assetVariants,
                previewTokens,
                viewerConfigVersionRepository
        );
    }

    @Bean
    public GalleryTexturePolicy galleryTexturePolicy(
            GalleryViewerConfigRepository configRepository,
            GalleryRepository galleryRepository
    ) {
        return new DefaultGalleryTexturePolicy(configRepository, galleryRepository);
    }

    @Bean
    public GalleryViewerConfigFacade galleryViewerConfigFacade(
            GalleryViewerConfigRepository galleryViewerConfigRepository,
            ViewerConfigVersionRepository viewerConfigVersionRepository,
            GalleryRepository galleryRepository,
            WorkspaceAuthorizationPolicy authorization
    ) {
        return new GalleryViewerConfigFacade(
                galleryViewerConfigRepository,
                viewerConfigVersionRepository,
                galleryRepository,
                authorization
        );
    }
}
