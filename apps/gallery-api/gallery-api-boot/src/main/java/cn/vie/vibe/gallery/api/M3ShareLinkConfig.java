package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.*;
import cn.vie.vibe.gallery.infrastructure.Sha256TokenGenerator;
import cn.vie.vibe.gallery.infrastructure.persistence.MyBatisShareLinkRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * M3 配置：分享链接、公开访问和 3D 视觉展示配置
 */
@Configuration
public class M3ShareLinkConfig {

    private static final Logger log = LoggerFactory.getLogger(M3ShareLinkConfig.class);

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
            StorageObjectRepository storageObjectRepository,
            ObjectStoragePort objectStoragePort,
            TokenGenerator tokenGenerator,
            @Value("${gallery.public.base-url:http://localhost:5174}") String configuredPublicBaseUrl,
            SharePosterService sharePosterService,
            WorkspaceAuthorizationPolicy authorization
    ) {
        return new ShareLinkFacade(
                shareLinkRepository,
                galleryRepository,
                photoRepository,
                storageObjectRepository,
                objectStoragePort,
                tokenGenerator,
                normalizePublicBaseUrl(configuredPublicBaseUrl),
                sharePosterService,
                authorization
        );
    }

    /**
     * 归一化站点根地址：后端会在该地址后自行拼接 /g/{slug} 与 /s/{code}，
     * 历史配置可能带 /g 后缀（会拼出 /g/g/{slug}、/g/s/{code} 的坏链接），自动剥离。
     */
    static String normalizePublicBaseUrl(String configured) {
        String value = configured == null ? "" : configured.trim();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        if (value.endsWith("/g")) {
            log.warn("gallery.public.base-url 配置带 /g 后缀，已自动剥离（分享与短链路径由后端拼接）：{}", configured);
            value = value.substring(0, value.length() - 2);
        }
        return value;
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
