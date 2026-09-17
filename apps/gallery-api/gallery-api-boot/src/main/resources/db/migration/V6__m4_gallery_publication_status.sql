ALTER TABLE gallery
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN published_at DATETIME(6) NULL;

-- Existing non-deleted galleries were already publicly reachable before M4.
-- The predicate makes the backfill safe to repeat without changing a publication timestamp.
UPDATE gallery
SET status = 'PUBLISHED', published_at = COALESCE(published_at, UTC_TIMESTAMP(6))
WHERE deleted_at IS NULL AND status = 'DRAFT';

CREATE INDEX idx_gallery_status_deleted_created
    ON gallery (status, deleted_at, created_at);

ALTER TABLE gallery
    ADD CONSTRAINT ck_gallery_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
