package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.StorageObjectRepository;
import cn.vie.vibe.gallery.domain.StorageObject;
import cn.vie.vibe.gallery.domain.StorageObjectStatus;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.StorageObjectMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.instant;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.localDateTime;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.uuid;

@Repository
public class MyBatisStorageObjectRepository implements StorageObjectRepository {
    private final StorageObjectMapper m;

    public MyBatisStorageObjectRepository(StorageObjectMapper m) {
        this.m = m;
    }

    private StorageObject d(Map<String, Object> r) {
        if (r == null) return null;
        return new StorageObject(
                uuid(r, "id"),
                uuid(r, "tenantId"),
                (String) r.get("bucket"),
                (String) r.get("objectKey"),
                (String) r.get("thumbnailKey"),
                (String) r.get("mimeType"),
                ((Number) r.get("byteSize")).longValue(),
                (Integer) r.get("width"),
                (Integer) r.get("height"),
                (String) r.get("sha256"),
                StorageObjectStatus.valueOf((String) r.get("status")),
                instant(r, "createdAt")
        );
    }

    @Override
    public StorageObject save(StorageObject o) {
        m.insert(o.id().toString(), o.tenantId().toString(), o.bucket(), o.objectKey(), o.thumbnailKey(),
                o.mimeType(), o.byteSize(), o.width(), o.height(), o.sha256(), o.status().name(),
                localDateTime(o.createdAt()));
        return o;
    }

    @Override
    public Optional<StorageObject> findById(UUID t, UUID i) {
        return Optional.ofNullable(m.byId(t.toString(), i.toString())).map(this::d);
    }

    @Override
    public int markReady(UUID t, UUID i, String k, Integer w, Integer h) {
        return m.ready(t.toString(), i.toString(), k, w, h);
    }

    @Override
    public int markFailed(UUID t, UUID i) {
        return m.failed(t.toString(), i.toString());
    }

    @Override
    public int softDelete(UUID t, UUID i) {
        return m.delete(t.toString(), i.toString());
    }

    @Override
    public List<StorageObject> findStaleUploading(Instant threshold, int limit) {
        return m.findStaleUploading(localDateTime(threshold), limit).stream().map(this::d).toList();
    }

    @Override
    public List<StorageObject> findOrphanObjects(Instant threshold, int limit) {
        return m.findOrphanObjects(localDateTime(threshold), limit).stream().map(this::d).toList();
    }
}
