CREATE TABLE users (
    id BINARY(16) NOT NULL,
    email VARCHAR(320) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    last_login_at DATETIME(6) NULL,
    deleted_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_email (email),
    CONSTRAINT ck_users_status CHECK (status IN ('ACTIVE', 'DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE tenant (
    id BINARY(16) NOT NULL,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(80) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    deleted_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_slug (slug),
    CONSTRAINT ck_tenant_status CHECK (status IN ('ACTIVE', 'DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE membership (
    id BINARY(16) NOT NULL,
    user_id BINARY(16) NOT NULL,
    tenant_id BINARY(16) NOT NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'OWNER',
    deleted_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_membership_user_tenant (user_id, tenant_id),
    KEY idx_membership_user_created (user_id, created_at),
    KEY idx_membership_tenant_user (tenant_id, user_id),
    CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_membership_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
    CONSTRAINT ck_membership_role CHECK (role IN ('OWNER'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE gallery (
    id BINARY(16) NOT NULL,
    tenant_id BINARY(16) NOT NULL,
    slug VARCHAR(80) NOT NULL,
    name VARCHAR(160) NOT NULL,
    visibility VARCHAR(16) NOT NULL DEFAULT 'PRIVATE',
    cover_photo_id BINARY(16) NULL,
    deleted_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_gallery_tenant_slug (tenant_id, slug),
    KEY idx_gallery_tenant_deleted_created (tenant_id, deleted_at, created_at),
    CONSTRAINT fk_gallery_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (id),
    CONSTRAINT ck_gallery_visibility CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'PASSWORD'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
