package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.*;

import java.time.LocalDateTime;
import java.util.Map;

@Mapper
public interface BrandSiteMapper {
    String COLUMNS = "BIN_TO_UUID(id) id, BIN_TO_UUID(tenant_id) tenantId, subdomain, status, enabled, " +
            "config_json configJson, schema_version schemaVersion, created_at createdAt, updated_at updatedAt, " +
            "BIN_TO_UUID(updated_by_user_id) updatedByUserId, last_published_at lastPublishedAt, " +
            "BIN_TO_UUID(published_version_id) publishedVersionId";

    @Select("SELECT " + COLUMNS + " FROM brand_site WHERE tenant_id = UUID_TO_BIN(#{tenantId})")
    Map<String, Object> findByTenantId(@Param("tenantId") String tenantId);

    @Select("SELECT " + COLUMNS + " FROM brand_site WHERE subdomain = #{subdomain}")
    Map<String, Object> findBySubdomain(@Param("subdomain") String subdomain);

    @Insert("INSERT INTO brand_site (id, tenant_id, subdomain, status, enabled, config_json, schema_version, " +
            "created_at, updated_at, updated_by_user_id, last_published_at, published_version_id) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{tenantId}), #{subdomain}, #{status}, #{enabled}, #{configJson}, " +
            "#{schemaVersion}, #{createdAt}, #{updatedAt}, UUID_TO_BIN(#{updatedByUserId}), " +
            "#{lastPublishedAt}, UUID_TO_BIN(#{publishedVersionId})) " +
            "ON DUPLICATE KEY UPDATE subdomain = VALUES(subdomain), status = VALUES(status), enabled = VALUES(enabled), " +
            "config_json = VALUES(config_json), schema_version = VALUES(schema_version), " +
            "updated_by_user_id = VALUES(updated_by_user_id), last_published_at = VALUES(last_published_at), " +
            "published_version_id = VALUES(published_version_id), updated_at = VALUES(updated_at)")
    int upsert(
            @Param("id") String id,
            @Param("tenantId") String tenantId,
            @Param("subdomain") String subdomain,
            @Param("status") String status,
            @Param("enabled") boolean enabled,
            @Param("configJson") String configJson,
            @Param("schemaVersion") int schemaVersion,
            @Param("createdAt") LocalDateTime createdAt,
            @Param("updatedAt") LocalDateTime updatedAt,
            @Param("updatedByUserId") String updatedByUserId,
            @Param("lastPublishedAt") LocalDateTime lastPublishedAt,
            @Param("publishedVersionId") String publishedVersionId
    );

    @Update("UPDATE brand_site SET last_published_at = #{publishedAt}, published_version_id = UUID_TO_BIN(#{versionId}), " +
            "updated_at = #{publishedAt} WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND id = UUID_TO_BIN(#{siteId})")
    int publish(
            @Param("tenantId") String tenantId,
            @Param("siteId") String siteId,
            @Param("versionId") String versionId,
            @Param("publishedAt") LocalDateTime publishedAt
    );
}
