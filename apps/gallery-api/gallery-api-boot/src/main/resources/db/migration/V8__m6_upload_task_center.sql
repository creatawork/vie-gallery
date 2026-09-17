-- M6 task center: extend the single-photo task into a durable, recoverable state machine.
ALTER TABLE photo_processing_task
    DROP CHECK ck_task_status,
    ADD COLUMN gallery_id BINARY(16) NULL AFTER photo_id,
    ADD COLUMN filename VARCHAR(255) NULL AFTER gallery_id,
    ADD COLUMN progress TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER status,
    ADD COLUMN stage VARCHAR(24) NOT NULL DEFAULT 'UPLOAD' AFTER progress,
    ADD COLUMN max_attempts INT NOT NULL DEFAULT 3 AFTER attempts,
    ADD COLUMN next_attempt_at DATETIME(6) NULL AFTER max_attempts,
    ADD COLUMN last_error_code VARCHAR(64) NULL AFTER error_message,
    ADD COLUMN last_error_message VARCHAR(500) NULL AFTER last_error_code,
    ADD COLUMN last_request_id VARCHAR(100) NULL AFTER last_error_message,
    ADD COLUMN worker_id VARCHAR(100) NULL AFTER locked_at,
    ADD COLUMN heartbeat_at DATETIME(6) NULL AFTER worker_id,
    ADD COLUMN started_at DATETIME(6) NULL AFTER heartbeat_at,
    ADD COLUMN finished_at DATETIME(6) NULL AFTER started_at,
    ADD COLUMN cancelled_at DATETIME(6) NULL AFTER finished_at,
    ADD COLUMN client_batch_id VARCHAR(100) NULL AFTER cancelled_at,
    ADD COLUMN idempotency_key VARCHAR(150) NULL AFTER client_batch_id;

UPDATE photo_processing_task t
JOIN photo p ON p.id = t.photo_id AND p.tenant_id = t.tenant_id
SET t.gallery_id = p.gallery_id,
    t.filename = COALESCE(t.filename, p.title),
    t.status = CASE WHEN t.status = 'PENDING' THEN 'QUEUED' ELSE t.status END;

ALTER TABLE photo_processing_task
    MODIFY COLUMN gallery_id BINARY(16) NOT NULL,
    MODIFY COLUMN filename VARCHAR(255) NOT NULL DEFAULT '',
    ADD CONSTRAINT fk_task_gallery FOREIGN KEY (gallery_id) REFERENCES gallery(id),
    ADD CONSTRAINT ck_task_status CHECK (status IN ('QUEUED','PROCESSING','SUCCEEDED','FAILED','CANCEL_REQUESTED','CANCELLED')),
    ADD CONSTRAINT ck_task_progress CHECK (progress BETWEEN 0 AND 100),
    ADD CONSTRAINT ck_task_stage CHECK (stage IN ('UPLOAD','VALIDATE','THUMBNAIL','TEXTURE','FINALIZE')),
    ADD KEY idx_task_tenant_gallery_status (tenant_id, gallery_id, status, created_at),
    ADD KEY idx_task_status_attempt (status, next_attempt_at, created_at),
    ADD KEY idx_task_tenant_created (tenant_id, created_at),
    ADD UNIQUE KEY uk_task_tenant_idempotency (tenant_id, idempotency_key);

ALTER TABLE photo
    DROP CHECK ck_photo_status,
    ADD CONSTRAINT ck_photo_status CHECK (status IN ('PROCESSING','READY','FAILED','CANCELLED','DELETED'));
