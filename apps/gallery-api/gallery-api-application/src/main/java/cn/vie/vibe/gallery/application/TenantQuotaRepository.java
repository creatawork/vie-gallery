package cn.vie.vibe.gallery.application;
import cn.vie.vibe.gallery.domain.TenantQuota;
import java.util.UUID;
public interface TenantQuotaRepository {
    TenantQuota findForUpdate(UUID tenantId);
    void ensure(UUID tenantId, long maxBytes, long maxPhotos);
    void reserve(UUID tenantId, long bytes, long photos);
    void release(UUID tenantId, long bytes, long photos);
}
