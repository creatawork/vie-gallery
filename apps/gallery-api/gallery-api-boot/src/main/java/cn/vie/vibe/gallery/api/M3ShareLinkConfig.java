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
    public ShareLinkFacade shareLinkFacade(
            ShareLinkRepository shareLinkRepository,
            GalleryRepository galleryRepository,
            TokenGenerator tokenGenerator,
            @Value("${gallery.public.base-url:https://gallery.vie-vibe.cn}") String publicBaseUrl,
            WorkspaceAuthorizationPolicy authorization
    ) {
        return new ShareLinkFacade(
                shareLinkRepository,
                galleryRepository,
                tokenGenerator,
                publicBaseUrl,
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
            CreatorPreviewTokens previewTokens
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
                previewTokens
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
