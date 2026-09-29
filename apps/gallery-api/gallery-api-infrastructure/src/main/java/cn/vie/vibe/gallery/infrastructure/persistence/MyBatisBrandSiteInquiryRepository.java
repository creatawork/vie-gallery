package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.BrandSiteInquiryRepository;
import cn.vie.vibe.gallery.domain.BrandSiteInquiry;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.BrandSiteInquiryMapper;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

@Repository
@Profile("!dev-memory")
public class MyBatisBrandSiteInquiryRepository implements BrandSiteInquiryRepository {
    private final BrandSiteInquiryMapper mapper;

    public MyBatisBrandSiteInquiryRepository(BrandSiteInquiryMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public void save(BrandSiteInquiry inquiry) {
        mapper.insert(
                inquiry.id().toString(),
                inquiry.siteId().toString(),
                inquiry.name(),
                inquiry.message(),
                MyBatisValueMapper.localDateTime(inquiry.createdAt())
        );
    }

    @Override
    public long countBySite(java.util.UUID siteId) {
        return mapper.countBySite(siteId.toString());
    }
}
