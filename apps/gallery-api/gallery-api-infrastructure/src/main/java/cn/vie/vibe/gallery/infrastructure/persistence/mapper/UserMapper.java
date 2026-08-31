package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

@Mapper
public interface UserMapper {
    @Select("SELECT BIN_TO_UUID(id) id, email, display_name displayName, password_hash passwordHash, status, last_login_at lastLoginAt " +
            "FROM users WHERE email = #{email} AND deleted_at IS NULL")
    Map<String, Object> findByEmail(@Param("email") String email);

    @Select("SELECT BIN_TO_UUID(id) id, email, display_name displayName, password_hash passwordHash, status, last_login_at lastLoginAt " +
            "FROM users WHERE id = UUID_TO_BIN(#{id}) AND deleted_at IS NULL")
    Map<String, Object> findById(@Param("id") String id);

    @Insert("INSERT INTO users (id, email, display_name, password_hash, status, last_login_at, deleted_at, created_at, updated_at) " +
            "VALUES (UUID_TO_BIN(#{id}), #{email}, #{displayName}, #{passwordHash}, #{status}, #{lastLoginAt}, NULL, #{createdAt}, #{updatedAt})")
    int insert(@Param("id") String id, @Param("email") String email, @Param("displayName") String displayName,
               @Param("passwordHash") String passwordHash, @Param("status") String status,
               @Param("lastLoginAt") LocalDateTime lastLoginAt, @Param("createdAt") LocalDateTime createdAt,
               @Param("updatedAt") LocalDateTime updatedAt);

    @Update("UPDATE users SET last_login_at = #{lastLoginAt}, updated_at = #{lastLoginAt} WHERE id = UUID_TO_BIN(#{id}) AND deleted_at IS NULL")
    int updateLastLoginAt(@Param("id") String id, @Param("lastLoginAt") LocalDateTime lastLoginAt);
}
