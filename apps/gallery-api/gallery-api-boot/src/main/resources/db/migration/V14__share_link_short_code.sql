-- WP-12.2 短链接服务：为分享链接增加全局唯一短码
-- 短码即访问凭证（与 raw token 等价的凭据），因此必须不可预测且全局唯一
ALTER TABLE share_link ADD COLUMN short_code VARCHAR(16) NULL AFTER token_hash;

CREATE UNIQUE INDEX uk_share_link_short_code ON share_link (short_code);
