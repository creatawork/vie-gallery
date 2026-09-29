package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface BrandSiteConfigVersionMapper {
    String COLUMNS = "BIN_TO_UUID(id) id, BIN_TO_UUID(tenant_id) tenantId, BIN_TO_UUID(site_id) siteId, " +
            "config_json configJson, template_id templateId, schema_version schemaVersion, " +
            "created_at createdAt, BIN_TO_UUID(created_by_user_id) createdByUserId";

    @Insert("INSERT INTO brand_site_config_version (id, tenant_id, site_id, config_json, template_id, schema_version, created_at, created_by_user_id) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{tenantId}), UUID_TO_BIN(#{siteId}), #{configJson}, #{templateId}, #{schemaVersion}, #{createdAt}, UUID_TO_BIN(#{createdByUserId}))")
    int insert(
            @Param("id") String id,
            @Param("tenantId") String tenantId,
            @Param("siteId") String siteId,
            @Param("configJson") String configJson,
            @Param("templateId") String templateId,
            @Param("schemaVersion") int schemaVersion,
            @Param("createdAt") LocalDateTime createdAt,
            @Param("createdByUserId") String createdByUserId
    );

    @Select("SELECT " + COLUMNS + " FROM brand_site_config_version " +
            "WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND site_id = UUID_TO_BIN(#{siteId}) AND id = UUID_TO_BIN(#{id})")
    Map<String, Object> findById(
            @Param("tenantId") String tenantId,
            @Param("siteId") String siteId,
            @Param("id") String id
    );

    @Select("SELECT " + COLUMNS + " FROM brand_site_config_version " +
            "WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND site_id = UUID_TO_BIN(#{siteId}) " +
            "ORDER BY created_at DESC, id DESC LIMIT #{limit} OFFSET #{offset}")
    List<Map<String, Object>> findBySite(
            @Param("tenantId") String tenantId,
            @Param("siteId") String siteId,
            @Param("offset") int offset,
            @Param("limit") int limit
    );

    @Select("SELECT COUNT(*) FROM brand_site_config_version " +
            "WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND site_id = UUID_TO_BIN(#{siteId})")
    long countBySite(@Param("tenantId") String tenantId, @Param("siteId") String siteId);

    @Update("UPDATE brand_site b JOIN brand_site_config_version v ON v.id = UUID_TO_BIN(#{versionId}) " +
            "SET b.last_published_at = #{publishedAt}, b.published_version_id = v.id, b.updated_at = #{publishedAt} " +
            "WHERE b.tenant_id = UUID_TO_BIN(#{tenantId}) AND b.id = UUID_TO_BIN(#{siteId})")
    int publish(
            @Param("tenantId") String tenantId,
            @Param("siteId") String siteId,
            @Param("versionId") String versionId,
            @Param("publishedAt") LocalDateTime publishedAt
    );
}
