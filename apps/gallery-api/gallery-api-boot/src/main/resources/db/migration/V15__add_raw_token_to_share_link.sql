-- 补充 V14 遗漏的 raw_token 字段
-- raw_token 用于短链接重定向时携带原始 token，避免暴露内部 token_hash
ALTER TABLE share_link ADD COLUMN raw_token VARCHAR(255) NULL AFTER short_code;
