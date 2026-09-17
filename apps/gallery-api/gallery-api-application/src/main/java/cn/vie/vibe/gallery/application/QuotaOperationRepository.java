package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.QuotaOperation;
import cn.vie.vibe.gallery.domain.QuotaOperationType;

import java.util.Optional;
import java.util.UUID;

public interface QuotaOperationRepository {
    /**
     * 尝试记录配额操作。若 (entityType, entityId, operationType) 已存在，则返回 false（幂等拦截）。
     */
    boolean recordOperation(QuotaOperation operation);

    Optional<QuotaOperation> findOperation(String entityType, UUID entityId, QuotaOperationType operationType);
}
