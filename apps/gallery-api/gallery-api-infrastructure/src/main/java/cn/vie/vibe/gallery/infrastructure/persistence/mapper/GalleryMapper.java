package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Mapper
public interface GalleryMapper {
    String COLUMNS = "BIN_TO_UUID(id) id, BIN_TO_UUID(tenant_id) tenantId, slug, name, visibility, " +
            "password_hash passwordHash, BIN_TO_UUID(cover_photo_id) coverPhotoId, " +
            "(deleted_at IS NOT NULL) deleted, created_at createdAt";

    @Select("SELECT " + COLUMNS + " FROM gallery WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND deleted_at IS NULL ORDER BY created_at DESC")
    List<Map<String, Object>> findAll(@Param("tenantId") String tenantId);

    @Select("SELECT " + COLUMNS + " FROM gallery WHERE tenant_id = UUID_TO_BIN(#{tenantId}) " +
            "AND slug = #{slug} AND deleted_at IS NULL LIMIT 1")
    Map<String, Object> findByTenantAndSlug(@Param("tenantId") String tenantId, @Param("slug") String slug);

    @Select("SELECT " + COLUMNS + " FROM gallery WHERE slug = #{slug} AND deleted_at IS NULL LIMIT 1")
    Map<String, Object> findBySlug(@Param("slug") String slug);

    @Select("SELECT " + COLUMNS + " FROM gallery WHERE id = UUID_TO_BIN(#{id}) AND deleted_at IS NULL LIMIT 1")
    Map<String, Object> findById(@Param("id") String id);

    @Insert("INSERT INTO gallery (id, tenant_id, slug, name, visibility, password_hash, cover_photo_id, deleted_at, created_at, updated_at) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{tenantId}), #{slug}, #{name}, #{visibility}, #{passwordHash}, " +
            "#{coverPhotoId}, NULL, #{createdAt}, #{updatedAt})")
    int insert(@Param("id") String id, @Param("tenantId") String tenantId, @Param("slug") String slug,
               @Param("name") String name, @Param("visibility") String visibility, @Param("passwordHash") String passwordHash,
               @Param("coverPhotoId") String coverPhotoId, @Param("createdAt") LocalDateTime createdAt, @Param("updatedAt") LocalDateTime updatedAt);

    @Update("UPDATE gallery SET name = #{name}, visibility = #{visibility}, password_hash = #{passwordHash}, " +
            "cover_photo_id = #{coverPhotoId}, updated_at = #{updatedAt} WHERE id = UUID_TO_BIN(#{id})")
    int update(@Param("id") String id, @Param("name") String name, @Param("visibility") String visibility,
               @Param("passwordHash") String passwordHash, @Param("coverPhotoId") String coverPhotoId,
               @Param("updatedAt") LocalDateTime updatedAt);
}
