package cn.vie.vibe.gallery.domain;

import java.time.Instant;
import java.util.UUID;

/**
 * 配额操作审计记录，用于确保配额释放的幂等性。
 * 
 * 每个实体（Photo、Task等）的每种操作类型（RESERVE、RELEASE）只能记录一次，
 * 通过唯一约束 uk_entity_operation (entity_type, entity_id, operation_type) 保证。
 */
public record QuotaOperation(
    UUID id,
    UUID tenantId,
    QuotaOperationType operationType,
    String entityType,
    UUID entityId,
    long byteDelta,
    int photoDelta,
    Instant createdAt
) {
    public static QuotaOperation reserve(UUID tenantId, String entityType, UUID entityId, 
                                        long bytes, int photos, Instant createdAt) {
        return new QuotaOperation(UUID.randomUUID(), tenantId, QuotaOperationType.RESERVE, 
                                 entityType, entityId, bytes, photos, createdAt);
    }

    public static QuotaOperation release(UUID tenantId, String entityType, UUID entityId, 
                                        long bytes, int photos, Instant createdAt) {
        return new QuotaOperation(UUID.randomUUID(), tenantId, QuotaOperationType.RELEASE, 
                                 entityType, entityId, bytes, photos, createdAt);
    }
}
