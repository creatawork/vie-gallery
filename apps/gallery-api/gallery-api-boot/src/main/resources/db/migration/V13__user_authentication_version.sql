-- Credentials version for invalidating sessions after password reset.
ALTER TABLE users
    ADD COLUMN authentication_version BIGINT NOT NULL DEFAULT 1 AFTER password_hash;
