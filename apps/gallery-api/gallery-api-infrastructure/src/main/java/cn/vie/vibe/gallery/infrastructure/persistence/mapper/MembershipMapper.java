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
public interface MembershipMapper {
    @Insert("INSERT INTO membership (id, user_id, tenant_id, role, deleted_at, created_at, updated_at) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{userId}), UUID_TO_BIN(#{tenantId}), #{role}, NULL, #{createdAt}, #{updatedAt})")
    int insert(@Param("id") String id, @Param("userId") String userId, @Param("tenantId") String tenantId,
               @Param("role") String role, @Param("createdAt") LocalDateTime createdAt,
               @Param("updatedAt") LocalDateTime updatedAt);

    @Select("SELECT BIN_TO_UUID(m.id) id, BIN_TO_UUID(m.user_id) userId, BIN_TO_UUID(m.tenant_id) tenantId, m.role, m.created_at createdAt " +
            "FROM membership m JOIN tenant t ON t.id = m.tenant_id " +
            "WHERE m.user_id = UUID_TO_BIN(#{userId}) AND m.deleted_at IS NULL " +
            "AND t.status = 'ACTIVE' AND t.deleted_at IS NULL " +
            "ORDER BY m.created_at ASC LIMIT 1")
    Map<String, Object> findDefaultActiveByUserId(@Param("userId") String userId);

    @Select("SELECT BIN_TO_UUID(m.id) id, BIN_TO_UUID(m.user_id) userId, BIN_TO_UUID(m.tenant_id) tenantId, " +
            "m.role, m.created_at createdAt, u.email, u.display_name displayName " +
            "FROM membership m JOIN users u ON u.id = m.user_id " +
            "WHERE m.tenant_id = UUID_TO_BIN(#{tenantId}) AND m.deleted_at IS NULL AND u.deleted_at IS NULL " +
            "ORDER BY m.created_at ASC")
    List<Map<String, Object>> listActiveByTenantId(@Param("tenantId") String tenantId);

    @Select("SELECT BIN_TO_UUID(m.id) id, BIN_TO_UUID(m.user_id) userId, BIN_TO_UUID(m.tenant_id) tenantId, m.role, m.created_at createdAt " +
            "FROM membership m JOIN users u ON u.id = m.user_id " +
            "WHERE m.user_id = UUID_TO_BIN(#{userId}) AND m.tenant_id = UUID_TO_BIN(#{tenantId}) " +
            "AND m.deleted_at IS NULL AND u.deleted_at IS NULL")
    Map<String, Object> findActiveByUserIdAndTenantId(@Param("userId") String userId, @Param("tenantId") String tenantId);

    @Select("SELECT BIN_TO_UUID(m.id) id, BIN_TO_UUID(m.user_id) userId, BIN_TO_UUID(m.tenant_id) tenantId, m.role, m.created_at createdAt " +
            "FROM membership m JOIN users u ON u.id = m.user_id " +
            "WHERE m.id = UUID_TO_BIN(#{membershipId}) AND m.tenant_id = UUID_TO_BIN(#{tenantId}) " +
            "AND m.deleted_at IS NULL AND u.deleted_at IS NULL")
    Map<String, Object> findActiveByIdAndTenantId(@Param("membershipId") String membershipId, @Param("tenantId") String tenantId);

    @Update("UPDATE membership SET role = #{role}, updated_at = #{updatedAt} " +
            "WHERE id = UUID_TO_BIN(#{membershipId}) AND tenant_id = UUID_TO_BIN(#{tenantId}) AND deleted_at IS NULL")
    int updateRole(@Param("tenantId") String tenantId, @Param("membershipId") String membershipId,
                   @Param("role") String role, @Param("updatedAt") LocalDateTime updatedAt);

    @Update("UPDATE membership SET deleted_at = #{deletedAt}, updated_at = #{deletedAt} " +
            "WHERE id = UUID_TO_BIN(#{membershipId}) AND tenant_id = UUID_TO_BIN(#{tenantId}) AND deleted_at IS NULL")
    int softDelete(@Param("tenantId") String tenantId, @Param("membershipId") String membershipId,
                   @Param("deletedAt") LocalDateTime deletedAt);

    @Select("SELECT id FROM tenant WHERE id = UUID_TO_BIN(#{tenantId}) FOR UPDATE")
    String lockTenant(@Param("tenantId") String tenantId);

    @Select("SELECT COUNT(*) FROM membership WHERE tenant_id = UUID_TO_BIN(#{tenantId}) AND role = 'OWNER' AND deleted_at IS NULL")
    int countActiveOwners(@Param("tenantId") String tenantId);
}
