# API 健康检查失败 — 最终根因与处置记录

> **时间**: 2026-09-23
> **结果**: ✅ 已修复，全容器 healthy，外部 HTTPS 访问正常
> **本次提交**: `8d9fd37`（此前为 `aed841a` 迁移冲突修复）

## 症状

- `vie-gallery-api` 处于 `Restarting (1)` 崩溃循环，无法对外提供服务
- 日志尾部错误：`Flyway Validate failed: Migration checksum mismatch for migration version 15 — Applied to database: null, Resolved locally: 231936636`

## 根因

此前线上 V15 迁移失败时，采用了**手动插入 `flyway_schema_history` 记录**的方式修复（见 `scripts/fix-raw-token-migration.sh` 的旧方案）：

1. 手动 UPDATE 插入的记录 `checksum` 为 **NULL**；
2. 同时手动建列只补了 `share_link.raw_token` 列，**漏掉了 V15 定义的 `idx_share_link_raw_token` 索引**；
3. 新镜像中 `V15__add_raw_token_to_share_link.sql` 的真实校验和是 `231936636`，Flyway `validate-on-migrate: true` 校验时数据库记录为 NULL → 校验失败 → Spring `flywayInitializer` bean 创建失败 → 应用启动即退出 → Docker 反复重启。

**教训**: 手动伪造 Flyway 历史时，checksum 必须写入与迁移文件一致的真实值，schema 变更必须与迁移 SQL 逐项对应（列 + 索引都要），否则后续任何一次重启都会因 validate 失败而崩溃循环。

## 处置步骤（本次实际执行）

```bash
# 1. 确认 schema 与 V15 一致 — 发现索引缺失，补齐
docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e 'CREATE INDEX idx_share_link_raw_token ON share_link(raw_token);'

# 2. 修正 Flyway 历史中 V15 的 checksum（NULL → 真实值 231936636）
docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e 'UPDATE flyway_schema_history SET checksum = 231936636
      WHERE version = "15" AND checksum IS NULL;'

# 3. 重启 API 容器
docker restart vie-gallery-api
```

## 验证结果（全部通过）

| 检查项 | 结果 |
|---|---|
| `docker ps` 全部容器 | api/viewer/admin/redis/mysql/minio 全部 healthy |
| `http://localhost:8088/actuator/health`（服务器内） | `{"status":"UP"}` |
| `https://gallery.vie-vibe.cn/api/auth/csrf`（外网） | 200，返回 CSRF token |
| `https://gallery.vie-vibe.cn/app/`（外网） | 200 text/html |

## 后续预防

1. **禁止手动 INSERT Flyway 历史**。迁移失败时优先用 `flyway repair` 或修正后让应用自身重跑迁移；如确需手工干预，checksum 必须取本地迁移文件的真实校验和（`mvn flyway:info` 可查）。
2. **手动补 schema 时对照迁移 SQL 全文**，列、索引、约束逐项核对，不要只补报错提到的那一项。
3. 诊断脚本 `scripts/diagnose-api.sh` 后续可加一项：`SELECT version, checksum IS NULL FROM flyway_schema_history WHERE success=1`，把 checksum 为 NULL 的记录直接报出来。
