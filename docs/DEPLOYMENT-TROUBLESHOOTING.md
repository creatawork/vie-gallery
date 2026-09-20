# 部署故障排查指南

## 常见问题：502 Bad Gateway

### 症状
- 访问 https://gallery.vie-vibe.cn 出现 502 错误
- 登录功能无法使用
- API 无响应

### 根本原因
Docker Compose `restart` 命令**不会重新加载环境变量**,导致容器启动时缺少必需的配置(如 JWT 密钥、加密密钥等),API 启动失败。

### ✅ 自动化解决方案

**GitHub Actions 已修复**: 部署工作流现在会正确使用 `--env-file` 参数,每次部署后应该自动正常启动。

### 🚨 应急手动修复

如果部署后仍然出现 502,SSH 到服务器运行一键修复脚本:

```bash
ssh ubuntu@gallery.vie-vibe.cn
cd ~/vie-gallery/infra
chmod +x fix-502.sh
./fix-502.sh
```

或者手动执行:

```bash
cd ~/vie-gallery/infra
docker compose -f docker-compose.production.yml down api
docker compose -f docker-compose.production.yml --env-file .env.production up -d api
```

### 📋 验证修复

修复后运行:

```bash
# 查看容器状态
docker ps | grep vie-gallery-api

# 查看启动日志
docker logs vie-gallery-api --tail=50

# 测试 API
curl http://localhost:8088/api/auth/csrf
```

如果看到返回 `{"headerName":"X-XSRF-TOKEN","token":"..."}`,说明 API 已正常运行。

## 核心原则

### ❌ 错误的重启方式
```bash
docker compose restart api  # 不会重新读取环境变量!
```

### ✅ 正确的重启方式
```bash
docker compose -f docker-compose.production.yml down api
docker compose -f docker-compose.production.yml --env-file .env.production up -d api
```

## 其他常见问题

### 阿里云 OSS 403 错误

**症状**: 照片上传成功,但访问时返回 403 Forbidden

**原因**: 
1. 预签名 URL 缺少 HTTP 方法 (`GET`)
2. 双重签名导致签名验证失败

**解决方案**: 已在 `AliyunOssObjectStorage.java` 和 `SignedUrlService.java` 中修复

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

API 容器需要以下环境变量(在 `.env.production` 中):

```bash
# 数据库
DB_URL=...
DB_USERNAME=...
DB_PASSWORD=...

# Redis
REDIS_URL=...

# Spring Profile
SPRING_PROFILES_ACTIVE=prod,aliyun-oss

# 阿里云 OSS
ALIYUN_OSS_ENDPOINT=...
ALIYUN_OSS_ACCESS_KEY_ID=...
ALIYUN_OSS_ACCESS_KEY_SECRET=...
ALIYUN_OSS_BUCKET=...

# 安全密钥 (必需!)
GALLERY_SECURITY_ENCRYPTION_SECRET=...
GALLERY_SECURITY_ENCRYPTION_SALT=...
GALLERY_SECURITY_JWT_SECRET=...
```

## 历史记录

- **2026-09-20**: 修复 GitHub Actions 部署工作流,添加 `--env-file` 参数
- **2026-09-20**: 创建一键修复脚本 `fix-502.sh`
- **2026-09-20**: 修复阿里云 OSS 签名问题
- **2026-09-20**: 增加 Nginx 超时时间到 300 秒

## 联系方式

如果问题仍未解决,请检查:
1. GitHub Actions 运行日志
2. 服务器上的 Docker 日志: `docker logs vie-gallery-api`
3. Nginx 错误日志: `sudo tail -f /var/log/nginx/error.log`
