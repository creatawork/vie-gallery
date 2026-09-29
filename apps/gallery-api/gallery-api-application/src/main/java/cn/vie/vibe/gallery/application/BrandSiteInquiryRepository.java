package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.BrandSiteInquiry;

import java.util.UUID;

public interface BrandSiteInquiryRepository {
    void save(BrandSiteInquiry inquiry);

    long countBySite(UUID siteId);
}
