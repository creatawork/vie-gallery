package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface PhotoAssetVariantMapper {
    String COLUMNS = "BIN_TO_UUID(id) id, BIN_TO_UUID(tenant_id) tenantId, BIN_TO_UUID(photo_id) photoId, " +
            "BIN_TO_UUID(storage_object_id) storageObjectId, variant_kind kind, object_key objectKey, " +
            "mime_type mimeType, byte_size byteSize, width, height, sha256, status, created_at createdAt, updated_at updatedAt";

    @Insert("INSERT INTO photo_asset_variant (id, tenant_id, photo_id, storage_object_id, variant_kind, object_key, mime_type, byte_size, width, height, sha256, status, created_at, updated_at) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{tenantId}), UUID_TO_BIN(#{photoId}), UUID_TO_BIN(#{storageObjectId}), #{kind}, #{objectKey}, #{mimeType}, #{byteSize}, #{width}, #{height}, #{sha256}, #{status}, #{createdAt}, #{updatedAt}) " +
            "ON DUPLICATE KEY UPDATE storage_object_id=VALUES(storage_object_id), object_key=VALUES(object_key), mime_type=VALUES(mime_type), byte_size=VALUES(byte_size), width=VALUES(width), height=VALUES(height), sha256=VALUES(sha256), status=VALUES(status), updated_at=VALUES(updated_at)")
    int upsert(@Param("id") String id, @Param("tenantId") String tenantId, @Param("photoId") String photoId,
               @Param("storageObjectId") String storageObjectId, @Param("kind") String kind, @Param("objectKey") String objectKey,
               @Param("mimeType") String mimeType, @Param("byteSize") long byteSize, @Param("width") int width,
               @Param("height") int height, @Param("sha256") String sha256, @Param("status") String status,
               @Param("createdAt") LocalDateTime createdAt, @Param("updatedAt") LocalDateTime updatedAt);

    @Select("SELECT " + COLUMNS + " FROM photo_asset_variant WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND photo_id=UUID_TO_BIN(#{photoId}) ORDER BY variant_kind")
    List<Map<String, Object>> findByPhoto(@Param("tenantId") String tenantId, @Param("photoId") String photoId);

    @Select("SELECT " + COLUMNS + " FROM photo_asset_variant WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND photo_id=UUID_TO_BIN(#{photoId}) AND variant_kind=#{kind} AND status='READY' LIMIT 1")
    Map<String, Object> findReady(@Param("tenantId") String tenantId, @Param("photoId") String photoId, @Param("kind") String kind);

    @Update("UPDATE photo_asset_variant SET status='FAILED', updated_at=#{updatedAt} WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND photo_id=UUID_TO_BIN(#{photoId}) AND variant_kind=#{kind} AND status <> 'DELETED'")
    int markFailed(@Param("tenantId") String tenantId, @Param("photoId") String photoId, @Param("kind") String kind, @Param("updatedAt") LocalDateTime updatedAt);

    @Update("UPDATE photo_asset_variant SET status='DELETED', updated_at=#{updatedAt} WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND photo_id=UUID_TO_BIN(#{photoId}) AND variant_kind=#{kind} AND status <> 'DELETED'")
    int softDelete(@Param("tenantId") String tenantId, @Param("photoId") String photoId, @Param("kind") String kind, @Param("updatedAt") LocalDateTime updatedAt);
}
