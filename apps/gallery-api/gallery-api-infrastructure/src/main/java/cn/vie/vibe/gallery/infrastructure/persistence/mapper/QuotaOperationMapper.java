package cn.vie.vibe.gallery.infrastructure.persistence.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.Map;

@Mapper
public interface QuotaOperationMapper {
    @Insert("INSERT INTO quota_operation(id, tenant_id, operation_type, entity_type, entity_id, byte_delta, photo_delta, created_at) " +
            "VALUES(UUID_TO_BIN(#{id}), UUID_TO_BIN(#{tenantId}), #{operationType}, #{entityType}, UUID_TO_BIN(#{entityId}), #{byteDelta}, #{photoDelta}, #{createdAt})")
    int insert(@Param("id") String id,
               @Param("tenantId") String tenantId,
               @Param("operationType") String operationType,
               @Param("entityType") String entityType,
               @Param("entityId") String entityId,
               @Param("byteDelta") long byteDelta,
               @Param("photoDelta") int photoDelta,
               @Param("createdAt") LocalDateTime createdAt);

    @Select("SELECT BIN_TO_UUID(id) id, BIN_TO_UUID(tenant_id) tenantId, operation_type operationType, " +
            "entity_type entityType, BIN_TO_UUID(entity_id) entityId, byte_delta byteDelta, photo_delta photoDelta, created_at createdAt " +
            "FROM quota_operation WHERE entity_type=#{entityType} AND entity_id=UUID_TO_BIN(#{entityId}) AND operation_type=#{operationType} LIMIT 1")
    Map<String, Object> findByEntityAndType(@Param("entityType") String entityType,
                                           @Param("entityId") String entityId,
                                           @Param("operationType") String operationType);
}
