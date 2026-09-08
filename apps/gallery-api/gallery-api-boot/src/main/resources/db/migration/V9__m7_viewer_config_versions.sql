-- M7.1: immutable published snapshots for viewer configuration.
-- IDs follow the existing UUID/BINARY(16) convention.
CREATE TABLE gallery_viewer_config_version (
    id BINARY(16) NOT NULL,
    tenant_id BINARY(16) NOT NULL,
    gallery_id BINARY(16) NOT NULL,
    config_json LONGTEXT NOT NULL,
    preset_name VARCHAR(50) NULL,
    schema_version INT NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    created_by_user_id BINARY(16) NULL,
    PRIMARY KEY (id),
    KEY idx_viewer_config_version_gallery (tenant_id, gallery_id, created_at, id),
    CONSTRAINT fk_viewer_config_version_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
    CONSTRAINT fk_viewer_config_version_gallery FOREIGN KEY (gallery_id) REFERENCES gallery(id) ON DELETE CASCADE,
    CONSTRAINT fk_viewer_config_version_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT ck_viewer_config_version_schema CHECK (schema_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE gallery_viewer_config
    ADD COLUMN schema_version INT NOT NULL DEFAULT 1 AFTER preset_name,
    ADD COLUMN updated_by_user_id BINARY(16) NULL AFTER updated_at,
    ADD COLUMN last_published_at DATETIME(6) NULL AFTER updated_by_user_id,
    ADD COLUMN published_version_id BINARY(16) NULL AFTER last_published_at,
    ADD KEY idx_viewer_config_published_version (published_version_id),
    ADD CONSTRAINT fk_viewer_config_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_viewer_config_published_version FOREIGN KEY (published_version_id)
        REFERENCES gallery_viewer_config_version(id) ON DELETE SET NULL,
    ADD CONSTRAINT ck_viewer_config_schema CHECK (schema_version >= 1);

-- Preserve the pre-M7 public behavior: every existing config becomes its first
-- published snapshot. Reusing the config UUID keeps the migration deterministic.
INSERT INTO gallery_viewer_config_version (
    id, tenant_id, gallery_id, config_json, preset_name, schema_version, created_at, created_by_user_id
)
SELECT c.id, g.tenant_id, c.gallery_id, c.config_json, c.preset_name, c.schema_version, c.updated_at, NULL
FROM gallery_viewer_config c
JOIN gallery g ON g.id = c.gallery_id;

UPDATE gallery_viewer_config
SET published_version_id = id,
    last_published_at = updated_at;
