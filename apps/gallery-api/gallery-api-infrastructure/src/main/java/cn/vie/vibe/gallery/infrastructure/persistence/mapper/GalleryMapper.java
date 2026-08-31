package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Mapper
public interface GalleryMapper {
    String COLUMNS = "BIN_TO_UUID(id) id, BIN_TO_UUID(tenant_id) tenantId, slug, name, visibility, " +
            "(deleted_at IS NOT NULL) deleted, created_at createdAt";

    @Select("SELECT " + COLUMNS + " FROM gallery WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND deleted_at IS NULL ORDER BY created_at DESC")
    List<Map<String, Object>> findAll(@Param("tenantId") String tenantId);

    @Select("SELECT " + COLUMNS + " FROM gallery WHERE tenant_id = UUID_TO_BIN(#{tenantId}) " +
            "AND slug = #{slug} AND deleted_at IS NULL LIMIT 1")
    Map<String, Object> findByTenantAndSlug(@Param("tenantId") String tenantId, @Param("slug") String slug);

    @Select("SELECT " + COLUMNS + " FROM gallery WHERE slug = #{slug} AND deleted_at IS NULL LIMIT 1")
    Map<String, Object> findBySlug(@Param("slug") String slug);

    @Insert("INSERT INTO gallery (id, tenant_id, slug, name, visibility, cover_photo_id, deleted_at, created_at, updated_at) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{tenantId}), #{slug}, #{name}, #{visibility}, NULL, NULL, #{createdAt}, #{updatedAt})")
    int insert(@Param("id") String id, @Param("tenantId") String tenantId, @Param("slug") String slug,
               @Param("name") String name, @Param("visibility") String visibility,
               @Param("createdAt") LocalDateTime createdAt, @Param("updatedAt") LocalDateTime updatedAt);
}
