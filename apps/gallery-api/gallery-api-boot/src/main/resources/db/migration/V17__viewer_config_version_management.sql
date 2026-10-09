ALTER TABLE gallery_viewer_config_version
    ADD COLUMN version_number BIGINT NULL AFTER gallery_id,
    ADD COLUMN title VARCHAR(60) NULL AFTER version_number,
    ADD COLUMN note VARCHAR(500) NULL AFTER title,
    ADD COLUMN metadata_updated_at DATETIME(6) NULL AFTER created_by_user_id,
    ADD COLUMN metadata_updated_by_user_id BINARY(16) NULL AFTER metadata_updated_at,
    ADD COLUMN deleted_at DATETIME(6) NULL AFTER metadata_updated_by_user_id,
    ADD COLUMN deleted_by_user_id BINARY(16) NULL AFTER deleted_at;

CREATE TEMPORARY TABLE viewer_config_version_numbers AS
SELECT id,
       ROW_NUMBER() OVER (PARTITION BY gallery_id ORDER BY created_at ASC, id ASC) AS version_number
FROM gallery_viewer_config_version;

UPDATE gallery_viewer_config_version v
JOIN viewer_config_version_numbers n ON n.id = v.id
SET v.version_number = n.version_number;

DROP TEMPORARY TABLE viewer_config_version_numbers;

ALTER TABLE gallery_viewer_config_version
    MODIFY version_number BIGINT NOT NULL,
    ADD CONSTRAINT ck_viewer_version_number CHECK (version_number > 0),
    ADD UNIQUE KEY uk_viewer_version_number (tenant_id, gallery_id, version_number),
    ADD KEY idx_viewer_version_history (tenant_id, gallery_id, deleted_at, version_number),
    ADD CONSTRAINT fk_viewer_version_metadata_user FOREIGN KEY (metadata_updated_by_user_id)
        REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_viewer_version_deleted_user FOREIGN KEY (deleted_by_user_id)
        REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE gallery
    ADD COLUMN viewer_config_version_counter BIGINT NOT NULL DEFAULT 0;

UPDATE gallery g
JOIN (
    SELECT gallery_id, MAX(version_number) AS maximum_number
    FROM gallery_viewer_config_version
    GROUP BY gallery_id
) v ON v.gallery_id = g.id
SET g.viewer_config_version_counter = v.maximum_number;
