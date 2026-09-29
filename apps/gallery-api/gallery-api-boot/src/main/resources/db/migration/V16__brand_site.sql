-- 品牌站（docs/brand-site-templates-design.md §7.3）：
-- 站点主表 + 配置版本表 + 询盘表。版本表先建（主表的发布指针引用它）。
CREATE TABLE brand_site_config_version (
    id BINARY(16) NOT NULL,
    tenant_id BINARY(16) NOT NULL,
    site_id BINARY(16) NOT NULL,
    config_json LONGTEXT NOT NULL,
    template_id VARCHAR(50) NULL,
    schema_version INT NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    created_by_user_id BINARY(16) NULL,
    PRIMARY KEY (id),
    KEY idx_brand_site_version_site (tenant_id, site_id, created_at, id),
    CONSTRAINT fk_brand_site_version_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
    CONSTRAINT fk_brand_site_version_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT ck_brand_site_version_schema CHECK (schema_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE brand_site (
    id BINARY(16) NOT NULL,
    tenant_id BINARY(16) NOT NULL,
    subdomain VARCHAR(63) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'TRIAL',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    config_json LONGTEXT NOT NULL,
    schema_version INT NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    updated_by_user_id BINARY(16) NULL,
    last_published_at DATETIME(6) NULL,
    published_version_id BINARY(16) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_brand_site_tenant (tenant_id),
    UNIQUE KEY uk_brand_site_subdomain (subdomain),
    KEY idx_brand_site_published_version (published_version_id),
    CONSTRAINT fk_brand_site_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
    CONSTRAINT fk_brand_site_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_brand_site_published_version FOREIGN KEY (published_version_id)
        REFERENCES brand_site_config_version(id) ON DELETE SET NULL,
    CONSTRAINT ck_brand_site_schema CHECK (schema_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE brand_site_inquiry (
    id BINARY(16) NOT NULL,
    site_id BINARY(16) NOT NULL,
    name VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_brand_site_inquiry_site (site_id, created_at),
    CONSTRAINT fk_brand_site_inquiry_site FOREIGN KEY (site_id) REFERENCES brand_site(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
