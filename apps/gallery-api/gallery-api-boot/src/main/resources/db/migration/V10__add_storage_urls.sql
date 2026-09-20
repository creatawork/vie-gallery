-- 添加 URL 字段到 storage_object 表
-- 存储固定的 OSS URL,避免每次动态生成签名

ALTER TABLE storage_object
    ADD COLUMN object_url VARCHAR(1000) NULL COMMENT '原图访问URL' AFTER thumbnail_key,
    ADD COLUMN thumbnail_url VARCHAR(1000) NULL COMMENT '缩略图访问URL' AFTER object_url;

-- 为 URL 字段添加索引以提升查询性能
CREATE INDEX idx_storage_object_urls ON storage_object(tenant_id, deleted_at);
