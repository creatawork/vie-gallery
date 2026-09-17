-- M7.2: durable photo renditions. Existing thumbnail_key remains the HIGH fallback.
CREATE TABLE photo_asset_variant (
    id BINARY(16) NOT NULL,
    tenant_id BINARY(16) NOT NULL,
    photo_id BINARY(16) NOT NULL,
    storage_object_id BINARY(16) NOT NULL,
    variant_kind VARCHAR(16) NOT NULL,
    object_key VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    byte_size BIGINT NOT NULL,
    width INT NOT NULL,
    height INT NOT NULL,
    sha256 VARCHAR(64) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'READY',
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_photo_asset_variant (tenant_id, photo_id, variant_kind),
    KEY idx_photo_asset_variant_photo (tenant_id, photo_id, status),
    CONSTRAINT fk_photo_asset_variant_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
    CONSTRAINT fk_photo_asset_variant_photo FOREIGN KEY (photo_id) REFERENCES photo(id) ON DELETE CASCADE,
    CONSTRAINT fk_photo_asset_variant_storage FOREIGN KEY (storage_object_id) REFERENCES storage_object(id) ON DELETE CASCADE,
    CONSTRAINT ck_photo_asset_variant_kind CHECK (variant_kind IN ('MEDIUM', 'HIGH', 'TEXTURE')),
    CONSTRAINT ck_photo_asset_variant_status CHECK (status IN ('READY', 'FAILED', 'DELETED')),
    CONSTRAINT ck_photo_asset_variant_dimensions CHECK (byte_size >= 0 AND width > 0 AND height > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO photo_asset_variant (
    id, tenant_id, photo_id, storage_object_id, variant_kind, object_key, mime_type,
    byte_size, width, height, sha256, status, created_at, updated_at
)
SELECT UUID_TO_BIN(UUID()), p.tenant_id, p.id, o.id, 'HIGH', o.thumbnail_key, 'image/jpeg',
       0, COALESCE(o.width, 1), COALESCE(o.height, 1), NULL, 'READY', o.created_at, o.created_at
FROM photo p
JOIN storage_object o ON o.id = p.storage_object_id
WHERE p.status = 'READY' AND o.status = 'READY' AND o.thumbnail_key IS NOT NULL;
