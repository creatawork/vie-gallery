package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.*;
import cn.vie.vibe.gallery.infrastructure.Sha256TokenGenerator;
import cn.vie.vibe.gallery.infrastructure.persistence.MyBatisShareLinkRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * M3 配置：分享链接和公开访问
 */
@Configuration
public class M3ShareLinkConfig {

    @Bean
    public ShareLinkFacade shareLinkFacade(
            ShareLinkRepository shareLinkRepository,
            GalleryRepository galleryRepository,
            TokenGenerator tokenGenerator,
            @Value("${gallery.public.base-url:https://gallery.vie-vibe.cn}") String publicBaseUrl
    ) {
        return new ShareLinkFacade(
                shareLinkRepository,
                galleryRepository,
                tokenGenerator,
                publicBaseUrl
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
            TokenGenerator tokenGenerator
    ) {
        return new PublicAccessFacade(
                galleryRepository,
                shareLinkRepository,
                photoRepository,
                storageObjectRepository,
                objectStoragePort,
                passwordHasher,
                tokenGenerator
        );
    }
}
