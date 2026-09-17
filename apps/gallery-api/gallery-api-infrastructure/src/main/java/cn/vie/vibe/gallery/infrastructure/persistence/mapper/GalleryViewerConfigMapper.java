package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.*;

import java.time.LocalDateTime;
import java.util.Map;

@Mapper
public interface GalleryViewerConfigMapper {
    String COLUMNS = "BIN_TO_UUID(id) id, BIN_TO_UUID(gallery_id) galleryId, config_json configJson, " +
            "enabled, preset_name presetName, created_at createdAt, updated_at updatedAt, " +
            "schema_version schemaVersion, BIN_TO_UUID(updated_by_user_id) updatedByUserId, " +
            "last_published_at lastPublishedAt, BIN_TO_UUID(published_version_id) publishedVersionId";

    @Select("SELECT " + COLUMNS + " FROM gallery_viewer_config WHERE gallery_id = UUID_TO_BIN(#{galleryId})")
    Map<String, Object> findByGalleryId(@Param("galleryId") String galleryId);

    @Insert("INSERT INTO gallery_viewer_config (id, gallery_id, config_json, enabled, preset_name, created_at, updated_at, schema_version, updated_by_user_id, published_version_id) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{galleryId}), #{configJson}, #{enabled}, #{presetName}, #{createdAt}, #{updatedAt}, #{schemaVersion}, UUID_TO_BIN(#{updatedByUserId}), UUID_TO_BIN(#{publishedVersionId})) " +
            "ON DUPLICATE KEY UPDATE config_json = VALUES(config_json), enabled = VALUES(enabled), " +
            "preset_name = VALUES(preset_name), schema_version = VALUES(schema_version), updated_by_user_id = VALUES(updated_by_user_id), " +
            "last_published_at = VALUES(last_published_at), published_version_id = VALUES(published_version_id), updated_at = VALUES(updated_at)")
    int upsert(
            @Param("id") String id,
            @Param("galleryId") String galleryId,
            @Param("configJson") String configJson,
            @Param("enabled") boolean enabled,
            @Param("presetName") String presetName,
            @Param("createdAt") LocalDateTime createdAt,
            @Param("updatedAt") LocalDateTime updatedAt,
            @Param("schemaVersion") int schemaVersion,
            @Param("updatedByUserId") String updatedByUserId,
            @Param("publishedVersionId") String publishedVersionId
    );

    @Delete("DELETE FROM gallery_viewer_config WHERE gallery_id = UUID_TO_BIN(#{galleryId})")
    int deleteByGalleryId(@Param("galleryId") String galleryId);

    @Update("UPDATE gallery_viewer_config SET schema_version = #{schemaVersion}, updated_by_user_id = #{updatedByUserId}, " +
            "last_published_at = #{lastPublishedAt}, published_version_id = #{publishedVersionId}, updated_at = #{updatedAt} " +
            "WHERE gallery_id = UUID_TO_BIN(#{galleryId})")
    int updateMeta(
            @Param("galleryId") String galleryId,
            @Param("schemaVersion") int schemaVersion,
            @Param("updatedByUserId") String updatedByUserId,
            @Param("lastPublishedAt") LocalDateTime lastPublishedAt,
            @Param("publishedVersionId") String publishedVersionId,
            @Param("updatedAt") LocalDateTime updatedAt
    );

    @Update("UPDATE gallery_viewer_config SET last_published_at = #{publishedAt}, published_version_id = #{versionId} " +
            "WHERE gallery_id = UUID_TO_BIN(#{galleryId}) AND published_version_id IS NULL")
    int linkPublishedToFirst(
            @Param("galleryId") String galleryId,
            @Param("versionId") String versionId,
            @Param("publishedAt") LocalDateTime publishedAt
    );
}
