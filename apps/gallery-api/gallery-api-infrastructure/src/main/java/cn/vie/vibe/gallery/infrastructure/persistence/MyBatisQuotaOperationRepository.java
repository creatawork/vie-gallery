package cn.vie.vibe.gallery.infrastructure.persistence;

import cn.vie.vibe.gallery.application.QuotaOperationRepository;
import cn.vie.vibe.gallery.domain.QuotaOperation;
import cn.vie.vibe.gallery.domain.QuotaOperationType;
import cn.vie.vibe.gallery.infrastructure.persistence.mapper.QuotaOperationMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.instant;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.localDateTime;
import static cn.vie.vibe.gallery.infrastructure.persistence.MyBatisValueMapper.uuid;

@Repository
public class MyBatisQuotaOperationRepository implements QuotaOperationRepository {
    private final QuotaOperationMapper mapper;

    public MyBatisQuotaOperationRepository(QuotaOperationMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public boolean recordOperation(QuotaOperation operation) {
        try {
            int rows = mapper.insert(
                    operation.id().toString(),
                    operation.tenantId().toString(),
                    operation.operationType().name(),
                    operation.entityType(),
                    operation.entityId().toString(),
                    operation.byteDelta(),
                    operation.photoDelta(),
                    localDateTime(operation.createdAt())
            );
            return rows > 0;
        } catch (DuplicateKeyException e) {
            return false;
        }
    }

    @Override
    public Optional<QuotaOperation> findOperation(String entityType, UUID entityId, QuotaOperationType operationType) {
        Map<String, Object> row = mapper.findByEntityAndType(entityType, entityId.toString(), operationType.name());
        if (row == null) return Optional.empty();
        return Optional.of(new QuotaOperation(
                uuid(row, "id"),
                uuid(row, "tenantId"),
                QuotaOperationType.valueOf((String) row.get("operationType")),
                (String) row.get("entityType"),
                uuid(row, "entityId"),
                ((Number) row.get("byteDelta")).longValue(),
                ((Number) row.get("photoDelta")).intValue(),
                instant(row, "createdAt")
        ));
    }
}
