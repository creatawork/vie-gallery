package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.*;

import java.time.LocalDateTime;

@Mapper
public interface BrandSiteInquiryMapper {
    @Insert("INSERT INTO brand_site_inquiry (id, site_id, name, message, created_at) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{siteId}), #{name}, #{message}, #{createdAt})")
    int insert(
            @Param("id") String id,
            @Param("siteId") String siteId,
            @Param("name") String name,
            @Param("message") String message,
            @Param("createdAt") LocalDateTime createdAt
    );

    @Select("SELECT COUNT(*) FROM brand_site_inquiry WHERE site_id = UUID_TO_BIN(#{siteId})")
    long countBySite(@Param("siteId") String siteId);
}
