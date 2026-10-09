package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface ViewerConfigVersionMapper {
    String COLUMNS = "BIN_TO_UUID(id) id, BIN_TO_UUID(tenant_id) tenantId, BIN_TO_UUID(gallery_id) galleryId, " +
            "version_number versionNumber, config_json configJson, preset_name presetName, schema_version schemaVersion, " +
            "created_at createdAt, BIN_TO_UUID(created_by_user_id) createdByUserId, title, note, " +
            "metadata_updated_at metadataUpdatedAt, BIN_TO_UUID(metadata_updated_by_user_id) metadataUpdatedByUserId, " +
            "deleted_at deletedAt, BIN_TO_UUID(deleted_by_user_id) deletedByUserId";

    @Insert("INSERT INTO gallery_viewer_config_version (id, tenant_id, gallery_id, version_number, config_json, preset_name, schema_version, created_at, created_by_user_id, title, note) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{tenantId}), UUID_TO_BIN(#{galleryId}), #{versionNumber}, #{configJson}, #{presetName}, #{schemaVersion}, #{createdAt}, UUID_TO_BIN(#{createdByUserId}), #{title}, #{note})")
    int insert(
            @Param("id") String id,
            @Param("tenantId") String tenantId,
            @Param("galleryId") String galleryId,
            @Param("versionNumber") long versionNumber,
            @Param("configJson") String configJson,
            @Param("presetName") String presetName,
            @Param("schemaVersion") int schemaVersion,
            @Param("createdAt") LocalDateTime createdAt,
            @Param("createdByUserId") String createdByUserId,
            @Param("title") String title,
            @Param("note") String note
    );

    @Select("SELECT " + COLUMNS + " FROM gallery_viewer_config_version " +
            "WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND gallery_id = UUID_TO_BIN(#{galleryId}) " +
            "AND deleted_at IS NULL ORDER BY version_number DESC LIMIT #{limit} OFFSET #{offset}")
    List<Map<String, Object>> findByGallery(
            @Param("tenantId") String tenantId,
            @Param("galleryId") String galleryId,
            @Param("offset") int offset,
            @Param("limit") int limit
    );

    @Select("SELECT COUNT(*) FROM gallery_viewer_config_version " +
            "WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND gallery_id = UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL")
    long countByGallery(@Param("tenantId") String tenantId, @Param("galleryId") String galleryId);

    @Select("SELECT " + COLUMNS + " FROM gallery_viewer_config_version " +
            "WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND gallery_id = UUID_TO_BIN(#{galleryId}) " +
            "AND id = UUID_TO_BIN(#{versionId}) AND deleted_at IS NULL LIMIT 1")
    Map<String, Object> findById(
            @Param("tenantId") String tenantId,
            @Param("galleryId") String galleryId,
            @Param("versionId") String versionId
    );

    @Select("SELECT " + COLUMNS + " FROM gallery_viewer_config_version " +
            "WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND gallery_id = UUID_TO_BIN(#{galleryId}) " +
            "AND id = UUID_TO_BIN(#{versionId}) LIMIT 1")
    Map<String, Object> findByIdIncludingDeleted(
            @Param("tenantId") String tenantId,
            @Param("galleryId") String galleryId,
            @Param("versionId") String versionId
    );

    @Select("SELECT BIN_TO_UUID(v.id) id, BIN_TO_UUID(v.tenant_id) tenantId, BIN_TO_UUID(v.gallery_id) galleryId, " +
            "v.version_number versionNumber, v.config_json configJson, v.preset_name presetName, v.schema_version schemaVersion, " +
            "v.created_at createdAt, BIN_TO_UUID(v.created_by_user_id) createdByUserId, v.title, v.note, " +
            "v.metadata_updated_at metadataUpdatedAt, BIN_TO_UUID(v.metadata_updated_by_user_id) metadataUpdatedByUserId, " +
            "v.deleted_at deletedAt, BIN_TO_UUID(v.deleted_by_user_id) deletedByUserId " +
            "FROM gallery_viewer_config c JOIN gallery_viewer_config_version v ON v.id = c.published_version_id " +
            "JOIN gallery g ON g.id = c.gallery_id WHERE g.tenant_id = UUID_TO_BIN(#{tenantId}) " +
            "AND c.gallery_id = UUID_TO_BIN(#{galleryId}) AND v.deleted_at IS NULL LIMIT 1")
    Map<String, Object> findPublished(
            @Param("tenantId") String tenantId,
            @Param("galleryId") String galleryId
    );

    @Update("UPDATE gallery_viewer_config c " +
            "JOIN gallery g ON g.id = c.gallery_id AND g.tenant_id = UUID_TO_BIN(#{tenantId}) " +
            "JOIN gallery_viewer_config_version v ON v.id = UUID_TO_BIN(#{versionId}) " +
            "AND v.tenant_id = UUID_TO_BIN(#{tenantId}) AND v.gallery_id = c.gallery_id " +
            "AND v.deleted_at IS NULL " +
            "SET c.published_version_id = v.id, c.last_published_at = #{publishedAt}, c.schema_version = v.schema_version " +
            "WHERE c.gallery_id = UUID_TO_BIN(#{galleryId})")
    int publish(
            @Param("tenantId") String tenantId,
            @Param("galleryId") String galleryId,
            @Param("versionId") String versionId,
            @Param("publishedAt") LocalDateTime publishedAt
    );

    @Update("UPDATE gallery_viewer_config c JOIN gallery g ON g.id = c.gallery_id " +
            "AND g.tenant_id = UUID_TO_BIN(#{tenantId}) SET c.published_version_id = NULL, c.last_published_at = NULL " +
            "WHERE c.gallery_id = UUID_TO_BIN(#{galleryId})")
    int clearPublished(@Param("tenantId") String tenantId, @Param("galleryId") String galleryId);

    @Select("SELECT BIN_TO_UUID(id) FROM gallery WHERE tenant_id = UUID_TO_BIN(#{tenantId}) " +
            "AND id = UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL FOR UPDATE")
    String lockGallery(@Param("tenantId") String tenantId, @Param("galleryId") String galleryId);

    @Select("SELECT viewer_config_version_counter FROM gallery WHERE tenant_id = UUID_TO_BIN(#{tenantId}) " +
            "AND id = UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL FOR UPDATE")
    Long versionCounter(@Param("tenantId") String tenantId, @Param("galleryId") String galleryId);

    @Update("UPDATE gallery SET viewer_config_version_counter = #{counter} WHERE tenant_id = UUID_TO_BIN(#{tenantId}) " +
            "AND id = UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL")
    int updateVersionCounter(@Param("tenantId") String tenantId, @Param("galleryId") String galleryId,
                             @Param("counter") long counter);

    @Update("UPDATE gallery_viewer_config_version SET title = #{title}, note = #{note}, " +
            "metadata_updated_at = #{at}, metadata_updated_by_user_id = UUID_TO_BIN(#{actor}) " +
            "WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND gallery_id = UUID_TO_BIN(#{galleryId}) " +
            "AND id = UUID_TO_BIN(#{versionId}) AND deleted_at IS NULL")
    int updateMetadata(@Param("tenantId") String tenantId, @Param("galleryId") String galleryId,
                       @Param("versionId") String versionId, @Param("title") String title,
                       @Param("note") String note, @Param("at") LocalDateTime at, @Param("actor") String actor);

    @Update("UPDATE gallery_viewer_config_version SET deleted_at = #{at}, deleted_by_user_id = UUID_TO_BIN(#{actor}) " +
            "WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND gallery_id = UUID_TO_BIN(#{galleryId}) " +
            "AND id = UUID_TO_BIN(#{versionId}) AND deleted_at IS NULL")
    int softDelete(@Param("tenantId") String tenantId, @Param("galleryId") String galleryId,
                   @Param("versionId") String versionId, @Param("at") LocalDateTime at,
                   @Param("actor") String actor);
}
