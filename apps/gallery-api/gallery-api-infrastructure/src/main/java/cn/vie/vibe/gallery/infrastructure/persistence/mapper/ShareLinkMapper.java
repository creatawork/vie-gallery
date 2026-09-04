package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * ShareLink MyBatis Mapper
 */
@Mapper
public interface ShareLinkMapper {
    String COLUMNS = "BIN_TO_UUID(id) id, BIN_TO_UUID(gallery_id) galleryId, token_hash tokenHash, " +
            "expires_at expiresAt, revoked_at revokedAt, last_accessed_at lastAccessedAt, " +
            "created_at createdAt, updated_at updatedAt";

    @Select("SELECT " + COLUMNS + " FROM share_link WHERE id = UUID_TO_BIN(#{id}) AND deleted_at IS NULL")
    Map<String, Object> findById(@Param("id") String id);

    @Select("SELECT " + COLUMNS + " FROM share_link WHERE token_hash = #{tokenHash} AND deleted_at IS NULL LIMIT 1")
    Map<String, Object> findByTokenHash(@Param("tokenHash") String tokenHash);

    @Select("SELECT " + COLUMNS + " FROM share_link WHERE gallery_id = UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL " +
            "ORDER BY created_at DESC")
    List<Map<String, Object>> findByGalleryId(@Param("galleryId") String galleryId);

    @Select("SELECT sl." + COLUMNS + " FROM share_link sl " +
            "INNER JOIN gallery g ON sl.gallery_id = g.id " +
            "WHERE sl.gallery_id = UUID_TO_BIN(#{galleryId}) " +
            "AND g.tenant_id = UUID_TO_BIN(#{tenantId}) " +
            "AND sl.deleted_at IS NULL " +
            "ORDER BY sl.created_at DESC")
    List<Map<String, Object>> findByGalleryIdAndTenantId(
            @Param("galleryId") String galleryId,
            @Param("tenantId") String tenantId
    );

    @Insert("INSERT INTO share_link (id, gallery_id, token_hash, expires_at, revoked_at, last_accessed_at, " +
            "deleted_at, created_at, updated_at) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{galleryId}), #{tokenHash}, #{expiresAt}, #{revokedAt}, " +
            "#{lastAccessedAt}, NULL, #{createdAt}, #{updatedAt})")
    int insert(
            @Param("id") String id,
            @Param("galleryId") String galleryId,
            @Param("tokenHash") String tokenHash,
            @Param("expiresAt") LocalDateTime expiresAt,
            @Param("revokedAt") LocalDateTime revokedAt,
            @Param("lastAccessedAt") LocalDateTime lastAccessedAt,
            @Param("createdAt") LocalDateTime createdAt,
            @Param("updatedAt") LocalDateTime updatedAt
    );

    @Update("UPDATE share_link SET revoked_at = #{revokedAt}, updated_at = #{updatedAt} " +
            "WHERE id = UUID_TO_BIN(#{id})")
    int updateRevokedAt(
            @Param("id") String id,
            @Param("revokedAt") LocalDateTime revokedAt,
            @Param("updatedAt") LocalDateTime updatedAt
    );

    @Update("UPDATE share_link SET last_accessed_at = #{lastAccessedAt}, updated_at = #{updatedAt} " +
            "WHERE id = UUID_TO_BIN(#{id})")
    int updateLastAccessedAt(
            @Param("id") String id,
            @Param("lastAccessedAt") LocalDateTime lastAccessedAt,
            @Param("updatedAt") LocalDateTime updatedAt
    );

    @Update("UPDATE share_link SET deleted_at = #{deletedAt}, updated_at = #{updatedAt} " +
            "WHERE id = UUID_TO_BIN(#{id})")
    int softDelete(
            @Param("id") String id,
            @Param("deletedAt") LocalDateTime deletedAt,
            @Param("updatedAt") LocalDateTime updatedAt
    );
}
