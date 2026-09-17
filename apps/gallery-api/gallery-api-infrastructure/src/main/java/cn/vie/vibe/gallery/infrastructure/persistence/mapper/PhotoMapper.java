package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.Map;

@Mapper
public interface PhotoMapper {
    String C = "BIN_TO_UUID(id) id,BIN_TO_UUID(tenant_id) tenantId,BIN_TO_UUID(gallery_id) galleryId,BIN_TO_UUID(storage_object_id) storageObjectId,title,sort_order sortOrder,is_cover cover,status,created_at createdAt";
    @Insert("INSERT INTO photo(id,tenant_id,gallery_id,storage_object_id,title,sort_order,is_cover,status,created_at,updated_at) VALUES(UUID_TO_BIN(#{id}),UUID_TO_BIN(#{tenantId}),UUID_TO_BIN(#{galleryId}),UUID_TO_BIN(#{objectId}),#{title},#{sortOrder},#{cover},#{status},#{createdAt},#{createdAt})")
    int insert(@Param("id") String id, @Param("tenantId") String tenantId, @Param("galleryId") String galleryId,
               @Param("objectId") String objectId, @Param("title") String title, @Param("sortOrder") int sortOrder,
               @Param("cover") boolean cover, @Param("status") String status, @Param("createdAt") java.time.LocalDateTime createdAt);

    @Select("SELECT " + C + " FROM photo WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND gallery_id=UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL ORDER BY sort_order,created_at,id")
    List<Map<String, Object>> byGallery(@Param("tenantId") String tenantId, @Param("galleryId") String galleryId);

    @Select("SELECT " + C + " FROM photo WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND id=UUID_TO_BIN(#{id}) AND deleted_at IS NULL")
    Map<String, Object> byId(@Param("tenantId") String tenantId, @Param("id") String id);

    @Select("SELECT " + C + " FROM photo WHERE id=UUID_TO_BIN(#{id}) AND deleted_at IS NULL")
    Map<String, Object> byIdPublic(@Param("id") String id);

    @Select("SELECT COUNT(*) FROM photo WHERE gallery_id=UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL")
    int countByGalleryId(@Param("galleryId") String galleryId);

    @Select("SELECT " + C + " FROM photo WHERE gallery_id=UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL ORDER BY sort_order,created_at,id LIMIT #{limit} OFFSET #{offset}")
    List<Map<String, Object>> byGalleryWithPagination(@Param("galleryId") String galleryId, @Param("offset") int offset, @Param("limit") int limit);

    @Select("SELECT " + C + " FROM photo WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND gallery_id=UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL AND status='READY' ORDER BY sort_order,created_at,id LIMIT #{limit} OFFSET #{offset}")
    List<Map<String, Object>> publicReadyByGallery(@Param("tenantId") String tenantId, @Param("galleryId") String galleryId,
                                                    @Param("offset") int offset, @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM photo WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND gallery_id=UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL AND status='READY'")
    int countPublicReadyByGallery(@Param("tenantId") String tenantId, @Param("galleryId") String galleryId);

    @Select("SELECT COUNT(*) FROM photo WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND gallery_id=UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL AND status='FAILED'")
    int countFailedByGallery(@Param("tenantId") String tenantId, @Param("galleryId") String galleryId);

    @Update("UPDATE photo SET status=#{status},updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND id=UUID_TO_BIN(#{id}) AND deleted_at IS NULL")
    int status(@Param("tenantId") String tenantId, @Param("id") String id, @Param("status") String status);

    @Update("UPDATE photo SET title=COALESCE(#{title},title),sort_order=COALESCE(#{sortOrder},sort_order),is_cover=COALESCE(#{cover},is_cover),updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND id=UUID_TO_BIN(#{id}) AND deleted_at IS NULL")
    int metadata(@Param("tenantId") String tenantId, @Param("id") String id, @Param("title") String title,
                 @Param("sortOrder") Integer sortOrder, @Param("cover") Boolean cover);

    @Update("UPDATE photo SET is_cover=FALSE,updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND gallery_id=UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL")
    int clearCoverByGallery(@Param("tenantId") String tenantId, @Param("galleryId") String galleryId);

    @Update("UPDATE photo SET deleted_at=UTC_TIMESTAMP(6),status='DELETED',updated_at=UTC_TIMESTAMP(6) WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND id=UUID_TO_BIN(#{id}) AND deleted_at IS NULL")
    int delete(@Param("tenantId") String tenantId, @Param("id") String id);
}
