package cn.vie.vibe.gallery.application;
import cn.vie.vibe.gallery.domain.StorageObject;
import java.util.Optional;
import java.util.UUID;
public interface StorageObjectRepository {
    StorageObject save(StorageObject object);
    Optional<StorageObject> findById(UUID tenantId, UUID objectId);
    int markReady(UUID tenantId, UUID objectId, String thumbnailKey, Integer width, Integer height);
    int markFailed(UUID tenantId, UUID objectId);
    int softDelete(UUID tenantId, UUID objectId);
}
