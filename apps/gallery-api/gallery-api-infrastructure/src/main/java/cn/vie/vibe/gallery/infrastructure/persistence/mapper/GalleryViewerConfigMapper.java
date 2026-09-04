package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.*;

import java.time.LocalDateTime;
import java.util.Map;

@Mapper
public interface GalleryViewerConfigMapper {
    String COLUMNS = "BIN_TO_UUID(id) id, BIN_TO_UUID(gallery_id) galleryId, config_json configJson, " +
            "enabled, preset_name presetName, created_at createdAt, updated_at updatedAt";

    @Select("SELECT " + COLUMNS + " FROM gallery_viewer_config WHERE gallery_id = UUID_TO_BIN(#{galleryId})")
    Map<String, Object> findByGalleryId(@Param("galleryId") String galleryId);

    @Insert("INSERT INTO gallery_viewer_config (id, gallery_id, config_json, enabled, preset_name, created_at, updated_at) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{galleryId}), #{configJson}, #{enabled}, #{presetName}, #{createdAt}, #{updatedAt}) " +
            "ON DUPLICATE KEY UPDATE config_json = VALUES(config_json), enabled = VALUES(enabled), " +
            "preset_name = VALUES(preset_name), updated_at = VALUES(updated_at)")
    int upsert(
            @Param("id") String id,
            @Param("galleryId") String galleryId,
            @Param("configJson") String configJson,
            @Param("enabled") boolean enabled,
            @Param("presetName") String presetName,
            @Param("createdAt") LocalDateTime createdAt,
            @Param("updatedAt") LocalDateTime updatedAt
    );

    @Delete("DELETE FROM gallery_viewer_config WHERE gallery_id = UUID_TO_BIN(#{galleryId})")
    int deleteByGalleryId(@Param("galleryId") String galleryId);
}
