CREATE TABLE storage_object (
    id BINARY(16) NOT NULL,
    tenant_id BINARY(16) NOT NULL,
    bucket VARCHAR(120) NOT NULL,
    object_key VARCHAR(500) NOT NULL,
    thumbnail_key VARCHAR(500) NULL,
    mime_type VARCHAR(100) NOT NULL,
    byte_size BIGINT NOT NULL,
    width INT NULL,
    height INT NULL,
    sha256 CHAR(64) NULL,
    status VARCHAR(16) NOT NULL,
    deleted_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_storage_object_key (bucket, object_key),
    KEY idx_storage_tenant_status (tenant_id, status, created_at),
    CONSTRAINT fk_storage_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
    CONSTRAINT ck_storage_status CHECK (status IN ('UPLOADING','READY','FAILED','DELETED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE photo (
    id BINARY(16) NOT NULL,
    tenant_id BINARY(16) NOT NULL,
    gallery_id BINARY(16) NOT NULL,
    storage_object_id BINARY(16) NOT NULL,
    title VARCHAR(200) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_cover BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(16) NOT NULL DEFAULT 'PROCESSING',
    deleted_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id), KEY idx_photo_tenant_gallery (tenant_id, gallery_id, deleted_at, sort_order),
    CONSTRAINT fk_photo_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
    CONSTRAINT fk_photo_gallery FOREIGN KEY (gallery_id) REFERENCES gallery(id),
    CONSTRAINT fk_photo_storage FOREIGN KEY (storage_object_id) REFERENCES storage_object(id),
    CONSTRAINT ck_photo_status CHECK (status IN ('PROCESSING','READY','FAILED','DELETED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE photo_processing_task (
    id BINARY(16) NOT NULL,
    tenant_id BINARY(16) NOT NULL,
    photo_id BINARY(16) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    error_message VARCHAR(500) NULL,
    locked_at DATETIME(6) NULL,
    completed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uk_photo_task_photo (photo_id), KEY idx_task_status_locked (status, locked_at),
    CONSTRAINT fk_task_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
    CONSTRAINT fk_task_photo FOREIGN KEY (photo_id) REFERENCES photo(id),
    CONSTRAINT ck_task_status CHECK (status IN ('PENDING','PROCESSING','SUCCEEDED','FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tenant_quota (
    tenant_id BINARY(16) NOT NULL,
    max_bytes BIGINT NOT NULL,
    used_bytes BIGINT NOT NULL DEFAULT 0,
    max_photos BIGINT NOT NULL,
    photo_count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id),
    CONSTRAINT fk_quota_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
