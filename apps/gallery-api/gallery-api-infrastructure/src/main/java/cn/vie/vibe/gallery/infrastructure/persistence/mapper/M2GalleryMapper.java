package cn.vie.vibe.gallery.infrastructure.persistence.mapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.Map;
@Mapper
public interface M2GalleryMapper {
 @Select("SELECT BIN_TO_UUID(id) id, BIN_TO_UUID(tenant_id) tenantId, slug, name, visibility, (deleted_at IS NOT NULL) deleted, created_at createdAt FROM gallery WHERE tenant_id=UUID_TO_BIN(#{tenantId}) AND id=UUID_TO_BIN(#{galleryId}) AND deleted_at IS NULL")
 Map<String,Object> findById(@Param("tenantId") String tenantId,@Param("galleryId") String galleryId);
}
