CREATE TABLE share_link (
    id BINARY(16) NOT NULL,
    gallery_id BINARY(16) NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    expires_at DATETIME(6) NULL,
    revoked_at DATETIME(6) NULL,
    last_accessed_at DATETIME(6) NULL,
    deleted_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_share_link_token_hash (token_hash),
    KEY idx_share_link_gallery (gallery_id, revoked_at, expires_at),
    CONSTRAINT fk_share_link_gallery FOREIGN KEY (gallery_id) REFERENCES gallery(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 为 gallery 表增加 password_hash 字段，支持 PASSWORD 可见性
ALTER TABLE gallery ADD COLUMN password_hash VARCHAR(100) NULL AFTER visibility;
