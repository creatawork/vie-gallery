# API 健康检查失败诊断报告

> **日期**: 2026-09-22  
> **问题**: `vie-gallery-api` 容器启动后健康检查失败  
> **影响范围**: 后端 API 服务无法正常响应请求

---

## 🔍 根本原因分析

### 数据库迁移变更
最近的提交引入了新的数据库迁移：

- **V15__add_raw_token_to_share_link.sql** (commit `df9838e`)
  ```sql
  ALTER TABLE share_link ADD COLUMN raw_token VARCHAR(255) NULL AFTER short_code;
  ```

### 问题机制

1. **API 容器启动流程**:
   - Docker 启动容器
   - Spring Boot 应用启动
   - Flyway 自动运行待执行的迁移 (V15)
   - 应用初始化完成
   - 健康检查端点 `/actuator/health` 可用

2. **可能的失败点**:
   - ✅ Flyway 已配置启用 (`validate-on-migrate: true`)
   - ❌ **迁移执行失败** - 最可能的原因
   - ❌ **应用启动失败** - 迁移后初始化错误
   - ❌ **健康检查超时** - 启动时间超过 60 秒

---

## 🛠️ 立即排查步骤

### 步骤 1: 查看 API 容器日志（最重要）

```bash
ssh root@gallery.vie-vibe.cn
cd ~/vie-gallery/infra
docker logs vie-gallery-api --tail=200
```

**关键错误标识**:
- `FlywayException` - 迁移失败
- `SQLSyntaxErrorException` - SQL 语法错误
- `JDBCConnectionException` - 数据库连接失败
- `BeanCreationException` - Spring Bean 初始化失败

### 步骤 2: 检查 Flyway 迁移历史

```bash
docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e "SELECT * FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;"
```

**预期结果**:
- 如果 V15 存在且 `success = 1` → 迁移成功
- 如果 V15 不存在 → 迁移未运行
- 如果 V15 存在且 `success = 0` → 迁移失败

### 步骤 3: 手动验证迁移 SQL

```bash
docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e "DESCRIBE share_link;"
```

**预期结果**:
- 应该包含 `raw_token VARCHAR(255)` 列
- 如果没有此列 → 需要手动执行迁移

### 步骤 4: 检查数据库连接

```bash
docker exec vie-gallery-api sh -c 'wget -qO- http://localhost:8080/actuator/health || echo FAILED'
```

---

## 🚨 可能的错误场景及解决方案

### 场景 A: 迁移冲突 - raw_token 列已存在

**错误信息**:
```
Duplicate column name 'raw_token'
```

**原因**: 某次手动操作或之前的失败尝试已经创建了该列

**解决方案**:
```bash
# 1. 检查列是否存在
docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e "SHOW COLUMNS FROM share_link LIKE 'raw_token';"

# 2. 如果列已存在，标记 V15 为成功（手动修复 Flyway 历史）
docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e "INSERT INTO flyway_schema_history (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success) 
      VALUES ((SELECT MAX(installed_rank)+1 FROM (SELECT * FROM flyway_schema_history) AS tmp), '15', 'add raw token to share link', 'SQL', 'V15__add_raw_token_to_share_link.sql', NULL, 'root', 0, 1);"

# 3. 重启 API 容器
docker restart vie-gallery-api
```

### 场景 B: 迁移失败 - share_link 表不存在

**错误信息**:
```
Table 'vie_gallery.share_link' doesn't exist
```

**原因**: 数据库初始化不完整

**解决方案**:
```bash
# 1. 检查所有表
docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e "SHOW TABLES;"

# 2. 如果缺少表，需要重新初始化数据库
docker compose -f docker-compose.production.yml down mysql
docker volume rm vie-network_mysql-data
docker compose -f docker-compose.production.yml up -d mysql
# 等待 MySQL 初始化完成后重启 API
docker restart vie-gallery-api
```

### 场景 C: 启动超时 - 应用启动时间过长

**症状**: 日志显示应用正在启动但健康检查失败

**解决方案**:
```bash
# 增加健康检查的 start_period
# 编辑 docker-compose.production.yml，将 start_period 从 60s 改为 120s
docker compose -f docker-compose.production.yml up -d api
```

### 场景 D: 环境变量缺失

**错误信息**:
```
Error creating bean with name 'encryptionService'
Could not resolve placeholder 'GALLERY_SECURITY_ENCRYPTION_SECRET'
```

**解决方案**:
```bash
# 检查环境变量
docker exec vie-gallery-api env | grep -E "GALLERY_|ALIYUN_|DB_|REDIS_"

# 如果缺失，检查 .env.production 文件
cat ~/vie-gallery/infra/.env.production
```

---

## 📋 完整诊断脚本

在服务器上运行此脚本进行完整诊断：

```bash
#!/bin/bash
# 保存为 diagnose-api.sh 并执行

echo "=== API 容器状态 ==="
docker ps -a | grep vie-gallery-api

echo -e "\n=== API 容器日志（最近 100 行）==="
docker logs vie-gallery-api --tail=100

echo -e "\n=== Flyway 迁移历史 ==="
docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e "SELECT installed_rank, version, description, success, installed_on FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 10;"

echo -e "\n=== share_link 表结构 ==="
docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e "DESCRIBE share_link;"

echo -e "\n=== 健康检查测试 ==="
docker exec vie-gallery-api wget -qO- http://localhost:8080/actuator/health || echo "HEALTH CHECK FAILED"

echo -e "\n=== 环境变量检查 ==="
docker exec vie-gallery-api env | grep -E "SPRING_PROFILES_ACTIVE|DB_URL|REDIS_URL"
```

---

## ✅ 预防措施（未来部署）

### 1. 在部署前验证迁移

```bash
# 在本地环境测试迁移
cd apps/gallery-api
mvn flyway:info
mvn flyway:validate
```

### 2. 部署工作流改进

在 `.github/workflows/deploy.yml` 的 `Deploy to server` 步骤后添加：

```yaml
- name: Check Flyway migrations
  run: |
    ssh ${{ secrets.SERVER_USER }}@${{ secrets.SERVER_HOST }} << 'ENDSSH'
    docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
      -e "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 3;"
    ENDSSH
```

### 3. 增强健康检查日志

修改 `docker-compose.production.yml` 中的 API 服务：

```yaml
healthcheck:
  test: ["CMD", "sh", "-c", "wget -qO- http://localhost:8080/actuator/health || (echo 'Health check failed' && exit 1)"]
  interval: 15s
  timeout: 5s
  retries: 5
  start_period: 90s  # 增加到 90 秒，给迁移更多时间
```

---

## 🎯 推荐行动顺序

1. **立即执行**: 运行完整诊断脚本，获取详细错误信息
2. **根据错误信息**: 应用对应场景的解决方案
3. **验证修复**: 确认 API 健康检查通过
4. **测试功能**: 验证短链接功能正常工作
5. **记录问题**: 更新文档说明遇到的具体问题和解决方案

---

## 📞 需要的信息

如果需要远程协助，请提供：

1. `docker logs vie-gallery-api --tail=200` 的完整输出
2. Flyway 迁移历史查询结果
3. `share_link` 表结构
4. 健康检查端点的响应

---

**注意**: 前端服务 (`vie-gallery-admin` 和 `vie-gallery-viewer`) 已正常运行，此问题仅影响后端 API。
