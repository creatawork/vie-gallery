CREATE TABLE gallery_viewer_config (
    id BINARY(16) NOT NULL,
    gallery_id BINARY(16) NOT NULL,
    config_json LONGTEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    preset_name VARCHAR(50) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_viewer_config_gallery (gallery_id),
    CONSTRAINT fk_viewer_config_gallery FOREIGN KEY (gallery_id) REFERENCES gallery(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
