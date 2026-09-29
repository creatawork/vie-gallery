package cn.vie.vibe.gallery.api;

import cn.vie.vibe.gallery.application.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 品牌站装配：领域服务对齐 M3ShareLinkConfig 的 Facade 装配模式（T5 复用既有范式）。
 */
@Configuration
public class BrandSiteWiring {

    @Bean
    public BrandSiteFacade brandSiteFacade(
            BrandSiteRepository brandSiteRepository,
            BrandSiteConfigVersionRepository brandSiteConfigVersionRepository,
            BrandSiteInquiryRepository brandSiteInquiryRepository,
            WorkspaceAuthorizationPolicy authorization
    ) {
        return new BrandSiteFacade(
                brandSiteRepository,
                brandSiteConfigVersionRepository,
                brandSiteInquiryRepository,
                authorization
        );
    }
}
