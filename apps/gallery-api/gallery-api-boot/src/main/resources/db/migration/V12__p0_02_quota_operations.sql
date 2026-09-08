-- P0-02: 配额操作日志表，用于实现配额释放幂等性

CREATE TABLE quota_operation (
    id BINARY(16) PRIMARY KEY,
    tenant_id BINARY(16) NOT NULL,
    operation_type VARCHAR(20) NOT NULL COMMENT 'RESERVE or RELEASE',
    entity_type VARCHAR(20) NOT NULL COMMENT 'PHOTO, TASK, etc',
    entity_id BINARY(16) NOT NULL,
    byte_delta BIGINT NOT NULL COMMENT 'Positive for reserve, negative for release',
    photo_delta INT NOT NULL COMMENT 'Positive for reserve, negative for release',
    created_at DATETIME(3) NOT NULL,
    UNIQUE KEY uk_entity_operation (entity_type, entity_id, operation_type),
    KEY idx_tenant_created (tenant_id, created_at),
    KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='配额操作审计日志，用于防止重复释放配额';

-- 添加对象状态字段的注释，明确状态机
ALTER TABLE storage_object 
    MODIFY COLUMN status VARCHAR(20) NOT NULL 
    COMMENT 'UPLOADING(初始), READY(处理完成), FAILED(处理失败), DELETED(已删除)';
