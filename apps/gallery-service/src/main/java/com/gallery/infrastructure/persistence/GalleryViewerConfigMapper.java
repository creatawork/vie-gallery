package com.gallery.infrastructure.persistence;

import com.gallery.domain.GalleryViewerConfig;
import org.apache.ibatis.annotations.*;

import java.util.Optional;

/**
 * 相册展示配置 Mapper
 */
@Mapper
public interface GalleryViewerConfigMapper {

    @Select("""
        SELECT id, gallery_id, config, enabled, preset_name, created_at, updated_at
        FROM gallery_viewer_config
        WHERE gallery_id = #{galleryId}
        """)
    @Results(id = "galleryViewerConfigResult", value = {
        @Result(property = "id", column = "id", typeHandler = UUIDTypeHandler.class),
        @Result(property = "galleryId", column = "gallery_id", typeHandler = UUIDTypeHandler.class),
        @Result(property = "configJson", column = "config"),
        @Result(property = "enabled", column = "enabled"),
        @Result(property = "presetName", column = "preset_name"),
        @Result(property = "createdAt", column = "created_at", typeHandler = InstantTypeHandler.class),
        @Result(property = "updatedAt", column = "updated_at", typeHandler = InstantTypeHandler.class)
    })
    Optional<GalleryViewerConfig> findByGalleryId(String galleryId);

    @Insert("""
        INSERT INTO gallery_viewer_config (id, gallery_id, config, enabled, preset_name, created_at, updated_at)
        VALUES (#{id, typeHandler=com.gallery.infrastructure.persistence.UUIDTypeHandler},
                #{galleryId, typeHandler=com.gallery.infrastructure.persistence.UUIDTypeHandler},
                #{configJson},
                #{enabled},
                #{presetName},
                #{createdAt, typeHandler=com.gallery.infrastructure.persistence.InstantTypeHandler},
                #{updatedAt, typeHandler=com.gallery.infrastructure.persistence.InstantTypeHandler})
        """)
    void insert(GalleryViewerConfig config);

    @Update("""
        UPDATE gallery_viewer_config
        SET config = #{configJson},
            enabled = #{enabled},
            preset_name = #{presetName},
            updated_at = #{updatedAt, typeHandler=com.gallery.infrastructure.persistence.InstantTypeHandler}
        WHERE gallery_id = #{galleryId, typeHandler=com.gallery.infrastructure.persistence.UUIDTypeHandler}
        """)
    void update(GalleryViewerConfig config);

    @Delete("""
        DELETE FROM gallery_viewer_config
        WHERE gallery_id = #{galleryId}
        """)
    int deleteByGalleryId(String galleryId);
}
