package cn.vie.vibe.gallery.application;

import cn.vie.vibe.gallery.domain.TenantQuota;

import java.util.UUID;

public interface TenantQuotaRepository {
    TenantQuota findForUpdate(UUID tenantId);

    void ensure(UUID tenantId, long maxBytes, long maxPhotos);

    void reserve(UUID tenantId, long bytes, long photos);

    void release(UUID tenantId, long bytes, long photos);

    /**
     * 幂等释放配额。同一 entityType + entityId 的 RELEASE 操作只会扣减一次配额。
     * @return true 表示成功扣减，false 表示此前已释放过（幂等跳过）
     */
    default boolean releaseOnce(UUID tenantId, String entityType, UUID entityId, long bytes, long photos) {
        release(tenantId, bytes, photos);
        return true;
    }
}
