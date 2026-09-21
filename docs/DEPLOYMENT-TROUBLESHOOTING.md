# 部署故障排查指南

## 常见问题：502 Bad Gateway

### 症状
- 访问 https://gallery.vie-vibe.cn 出现 502 错误
- 登录功能无法使用
- API 无响应

### 根本原因（含 2026-09-21 回归记录）

API 启动时需要以下必需环境变量，任一缺失即启动失败，Nginx 便对所有请求返回 502：

```bash
GALLERY_SECURITY_ENCRYPTION_SECRET  # AES-256 加密密钥
GALLERY_SECURITY_ENCRYPTION_SALT    # 加密盐值
GALLERY_SECURITY_JWT_SECRET         # JWT 签名密钥
ALIYUN_OSS_ENDPOINT / ACCESS_KEY_ID / ACCESS_KEY_SECRET / BUCKET  # OSS 媒体存储
```

**2026-09-21 回归**：提交 `dc0ef11` 曾为部署工作流加上 `--env-file .env.production`，但随后的
回滚提交 `e4802a2`（revert URL storage 功能）在回滚 deploy.yml 时把该修复一并撤销了——
尽管提交信息声称保留了它。此后每次推送部署，API 容器都以空密钥启动并循环崩溃，502 复现。

另一个隐蔽坑：compose 的 `environment` 中 `${ALIYUN_OSS_ENDPOINT}` 这类无默认值的插值，
在变量未定义时会解析为**空字符串**并覆盖 `env_file` 注入的真实值。因此密钥类变量
不能同时走 `environment` 插值和 `env_file` 两条路。

### ✅ 当前已落地的防回归机制

1. **compose 层兜底**：`docker-compose.production.yml` 中 api 服务声明了
   `env_file: .env.production`，安全密钥与 OSS 凭证直接注入容器，即使部署命令漏写
   `--env-file` 也不会拿到空值。密钥类变量已从 `environment` 插值中移除，避免空值覆盖。
2. **部署前预检**：deploy.yml 与 deploy.sh 在重启容器前检查 `.env.production` 存在且
   全部必需变量非空，缺失则部署直接失败并给出明确报错（而不是部署成功后 502）。
3. **健康门禁**：api 服务带 healthcheck（探测 `/actuator/health`），部署命令为
   `up -d --wait --wait-timeout 240`，只有 API 真正健康部署才算成功；不再用固定
   `sleep 10` 碰运气。
4. **真实验证**：部署后通过 SSH 在服务器本机依次检查 `:8088/actuator/health`（直连）
   和经 Nginx 的 `/api/auth/csrf`（代理链路），失败时输出 API 容器日志并让工作流报错。
   （旧步骤探测的 `/api/health` 端点并不存在，且 `|| echo` 把失败吞掉了。）
5. **滚动重启**：不再 `docker compose down` 全栈，改为 `up -d`，mysql/redis/minio
   在部署期间保持运行。

### 🚨 应急手动修复

如果部署后仍然出现 502，SSH 到服务器运行一键修复脚本：

```bash
ssh ubuntu@gallery.vie-vibe.cn
cd ~/vie-gallery/infra
./fix-502.sh
```

或者手动执行：

```bash
cd ~/vie-gallery/infra
docker compose -f docker-compose.production.yml --env-file .env.production up -d --force-recreate --wait api
```

### 📋 验证修复

```bash
# 容器状态与健康检查
docker ps | grep vie-gallery-api
docker inspect --format '{{.State.Health.Status}}' vie-gallery-api   # 应为 healthy

# 启动日志
docker logs vie-gallery-api --tail=50

# 直连与代理链路
curl http://localhost:8088/actuator/health          # {"status":"UP"}
curl -H 'Host: gallery.vie-vibe.cn' http://localhost/api/auth/csrf
```

如果 `/api/auth/csrf` 返回 CSRF token JSON，说明 API 已正常运行。

## 核心原则

### ❌ 错误的重启方式
```bash
docker compose restart api   # 容器沿用创建时的旧环境变量，改了 .env 也不会生效
```

### ✅ 正确的重启方式（重建容器）
```bash
cd ~/vie-gallery/infra
docker compose -f docker-compose.production.yml --env-file .env.production up -d --force-recreate --wait api
```

环境变量在容器创建时固化，`restart` 只是重启进程；修改 `.env.production` 后必须用
`up -d`（配置变化时自动重建）或 `up -d --force-recreate` 让容器重新创建。

## 其他常见问题

### 阿里云 OSS 403 错误

**症状**: 照片上传成功，但访问时返回 403 Forbidden

**原因**:
1. 预签名 URL 缺少 HTTP 方法 (`GET`)
2. 双重签名导致签名验证失败

**解决方案**: 已在 `AliyunOssObjectStorage.java` 和 `SignedUrlService.java` 中修复。
注意生产 profile 必须是 `prod,aliyun-oss`（compose 中已固定），否则不会启用 OSS 存储。

### 上传超时

**症状**: 大图片上传时请求超时

**原因**: Nginx 默认超时 60 秒

**解决方案**: 已在 `/etc/nginx/sites-available/vie-gallery` 中添加:
```nginx
location /api/ {
    proxy_read_timeout 300s;
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    ...
}
```

## 环境变量清单

API 容器需要以下变量（完整模板见 `infra/.env.production.example`，
安全密钥与 OSS 变量由 compose 的 `env_file` 直接注入，无需在 environment 中重复）：

```bash
# Spring profile（必须含 aliyun-oss）
SPRING_PROFILES_ACTIVE=prod,aliyun-oss

# 数据库
MYSQL_ROOT_PASSWORD=...
MYSQL_PASSWORD=...

# MinIO（兜底配置）
MINIO_ROOT_USER=...
MINIO_ROOT_PASSWORD=...

# 安全密钥 (必需！)
GALLERY_SECURITY_ENCRYPTION_SECRET=...
GALLERY_SECURITY_ENCRYPTION_SALT=...
GALLERY_SECURITY_JWT_SECRET=...

# 阿里云 OSS (必需！)
ALIYUN_OSS_ENDPOINT=...
ALIYUN_OSS_ACCESS_KEY_ID=...
ALIYUN_OSS_ACCESS_KEY_SECRET=...
ALIYUN_OSS_BUCKET=...
```

## 历史记录

- **2026-09-21**: 修复 `e4802a2` 回归——恢复 `--env-file`、api 增加 env_file/healthcheck、
  部署预检与真实验证、SPRING_PROFILES_ACTIVE 固定为 `prod,aliyun-oss`、修复 fix-502.sh
  的 `down api` 语法错误
- **2026-09-20**: 修复 GitHub Actions 部署工作流，添加 `--env-file` 参数（后被 `e4802a2` 意外回滚）
- **2026-09-20**: 创建一键修复脚本 `fix-502.sh`
- **2026-09-20**: 修复阿里云 OSS 签名问题
- **2026-09-20**: 增加 Nginx 超时时间到 300 秒

## 联系方式

如果问题仍未解决，请检查:
1. GitHub Actions 运行日志（部署步骤会在变量缺失时直接报错）
2. 服务器上的 Docker 日志: `docker logs vie-gallery-api`
3. Nginx 错误日志: `sudo tail -f /var/log/nginx/error.log`
