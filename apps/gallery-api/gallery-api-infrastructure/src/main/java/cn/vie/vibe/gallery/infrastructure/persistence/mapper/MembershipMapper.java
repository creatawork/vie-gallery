package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

@Mapper
public interface MembershipMapper {
    @Insert("INSERT INTO membership (id, user_id, tenant_id, role, deleted_at, created_at, updated_at) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{userId}), UUID_TO_BIN(#{tenantId}), #{role}, NULL, #{createdAt}, #{updatedAt})")
    int insert(@Param("id") String id, @Param("userId") String userId, @Param("tenantId") String tenantId,
               @Param("role") String role, @Param("createdAt") LocalDateTime createdAt,
               @Param("updatedAt") LocalDateTime updatedAt);

    @Select("SELECT BIN_TO_UUID(m.id) id, BIN_TO_UUID(m.user_id) userId, BIN_TO_UUID(m.tenant_id) tenantId, m.role " +
            "FROM membership m JOIN tenant t ON t.id = m.tenant_id " +
            "WHERE m.user_id = UUID_TO_BIN(#{userId}) AND m.deleted_at IS NULL " +
            "AND m.role IS NOT NULL AND t.status = 'ACTIVE' AND t.deleted_at IS NULL " +
            "ORDER BY m.created_at ASC LIMIT 1")
    Map<String, Object> findDefaultActiveByUserId(@Param("userId") String userId);
}
