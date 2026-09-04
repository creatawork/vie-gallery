-- M3 阶段：相册展示配置表
-- 用于存储每个相册的视觉配置（布局、背景、特效等）

CREATE TABLE gallery_viewer_config (
    id CHAR(36) PRIMARY KEY COMMENT '配置ID',
    gallery_id CHAR(36) NOT NULL COMMENT '相册ID',

    -- 配置内容（JSON格式）
    config JSON NOT NULL COMMENT '配置JSON',

    -- 是否启用
    enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',

    -- 预设名称（如果使用预设）
    preset_name VARCHAR(50) COMMENT '预设名称',

    created_at DATETIME NOT NULL COMMENT '创建时间',
    updated_at DATETIME NOT NULL COMMENT '更新时间',

    UNIQUE KEY uk_gallery (gallery_id),
    CONSTRAINT fk_gallery_config_gallery
        FOREIGN KEY (gallery_id) REFERENCES gallery(id) ON DELETE CASCADE,

    INDEX idx_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='相册展示配置表';
