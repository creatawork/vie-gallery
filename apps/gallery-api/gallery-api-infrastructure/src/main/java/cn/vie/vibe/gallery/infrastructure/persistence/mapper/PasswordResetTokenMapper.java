package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.*;

import java.time.LocalDateTime;

@Mapper
public interface PasswordResetTokenMapper {
    @Insert("INSERT INTO password_reset_token (id, user_id, token_hash, expires_at, used_at, created_at) " +
            "VALUES (UUID_TO_BIN(#{id}), UUID_TO_BIN(#{userId}), #{tokenHash}, #{expiresAt}, #{usedAt}, #{createdAt})")
    int insert(@Param("id") String id, @Param("userId") String userId, @Param("tokenHash") String tokenHash,
               @Param("expiresAt") LocalDateTime expiresAt, @Param("usedAt") LocalDateTime usedAt,
               @Param("createdAt") LocalDateTime createdAt);

    @Select("SELECT BIN_TO_UUID(id) AS id, BIN_TO_UUID(user_id) AS userId, token_hash AS tokenHash, " +
            "expires_at AS expiresAt, used_at AS usedAt, created_at AS createdAt " +
            "FROM password_reset_token WHERE token_hash = #{tokenHash}")
    @Results(id = "PasswordResetTokenResult", value = {
            @Result(property = "id", column = "id"),
            @Result(property = "userId", column = "userId"),
            @Result(property = "tokenHash", column = "tokenHash"),
            @Result(property = "expiresAt", column = "expiresAt"),
            @Result(property = "usedAt", column = "usedAt"),
            @Result(property = "createdAt", column = "createdAt")
    })
    PasswordResetTokenDto findByTokenHash(@Param("tokenHash") String tokenHash);

    @Update("UPDATE password_reset_token SET used_at = #{usedAt} WHERE id = UUID_TO_BIN(#{id})")
    int markAsUsed(@Param("id") String id, @Param("usedAt") LocalDateTime usedAt);

    @Delete("DELETE FROM password_reset_token WHERE user_id = UUID_TO_BIN(#{userId})")
    int deleteByUserId(@Param("userId") String userId);

    class PasswordResetTokenDto {
        public String id;
        public String userId;
        public String tokenHash;
        public LocalDateTime expiresAt;
        public LocalDateTime usedAt;
        public LocalDateTime createdAt;
    }
}
