package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

@Mapper
public interface TenantMapper {
    @Insert("INSERT INTO tenant (id, name, slug, status, deleted_at, created_at, updated_at) " +
            "VALUES (UUID_TO_BIN(#{id}), #{name}, #{slug}, #{status}, NULL, #{createdAt}, #{updatedAt})")
    int insert(@Param("id") String id, @Param("name") String name, @Param("slug") String slug,
               @Param("status") String status, @Param("createdAt") LocalDateTime createdAt,
               @Param("updatedAt") LocalDateTime updatedAt);

    @Select("SELECT BIN_TO_UUID(id) id, name, slug, status FROM tenant " +
            "WHERE id = UUID_TO_BIN(#{id}) AND status = 'ACTIVE' AND deleted_at IS NULL")
    Map<String, Object> findActiveById(@Param("id") String id);
}
