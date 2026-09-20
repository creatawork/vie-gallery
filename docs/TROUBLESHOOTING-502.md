# 502 Bad Gateway 故障排查指南

## 问题症状

- 访问 `https://gallery.vie-vibe.cn` 返回 502 错误
- Nginx 错误: `502 Bad Gateway`
- 登录功能失效

## 根本原因

部署新版本安全加密方案后,API 服务需要以下**必需的**环境变量才能启动:

```bash
GALLERY_SECURITY_ENCRYPTION_SECRET  # AES-256 加密密钥
GALLERY_SECURITY_ENCRYPTION_SALT    # 加密盐值
GALLERY_SECURITY_JWT_SECRET         # JWT 签名密钥
```

如果这些环境变量未配置,API 服务会启动失败,导致 Nginx 无法连接到后端。

## 快速修复步骤

### 1. SSH 登录服务器

```bash
ssh root@gallery.vie-vibe.cn
```

### 2. 检查服务状态

```bash
# 检查 Docker 容器
cd /opt/vie-gallery
docker-compose ps

# 查看 API 容器状态
docker-compose logs api --tail=50

# 或如果使用 systemd
systemctl status gallery-api
journalctl -u gallery-api -n 50
```

**预期错误日志**:
```
java.lang.IllegalStateException: Encryption secret must be configured via GALLERY_SECURITY_ENCRYPTION_SECRET environment variable
```

### 3. 生成安全密钥

```bash
cd /opt/vie-gallery

# 运行密钥生成脚本
bash scripts/generate-security-keys.sh

# 选择 'y' 保存到 .env.local
```

### 4. 配置环境变量

#### 方式A: 使用 docker-compose (推荐)

编辑 `docker-compose.yml`:

```bash
nano docker-compose.yml
```

确保 API 服务包含环境变量配置:

```yaml
services:
  api:
    image: vie-gallery-api:latest
    environment:
      - DB_URL=${DB_URL}
      - DB_USERNAME=${DB_USERNAME}
      - DB_PASSWORD=${DB_PASSWORD}
      - REDIS_URL=${REDIS_URL}
      - STORAGE_ENDPOINT=${STORAGE_ENDPOINT}
      - STORAGE_ACCESS_KEY=${STORAGE_ACCESS_KEY}
      - STORAGE_SECRET_KEY=${STORAGE_SECRET_KEY}
      # 新增安全配置
      - GALLERY_SECURITY_ENCRYPTION_SECRET=${GALLERY_SECURITY_ENCRYPTION_SECRET}
      - GALLERY_SECURITY_ENCRYPTION_SALT=${GALLERY_SECURITY_ENCRYPTION_SALT}
      - GALLERY_SECURITY_JWT_SECRET=${GALLERY_SECURITY_JWT_SECRET}
    env_file:
      - .env.local  # 从文件加载环境变量
```

#### 方式B: 使用 systemd

编辑服务文件:

```bash
nano /etc/systemd/system/gallery-api.service
```

添加:

```ini
[Service]
EnvironmentFile=/opt/vie-gallery/.env.local
```

### 5. 重启服务

```bash
# Docker Compose
docker-compose down
docker-compose up -d

# 或 systemd
systemctl daemon-reload
systemctl restart gallery-api
```

### 6. 验证修复

```bash
# 等待服务启动 (约10秒)
sleep 10

# 检查健康状态
curl http://localhost:8080/actuator/health

# 预期响应
{"status":"UP"}

# 检查容器日志
docker-compose logs api --tail=20

# 应该看到
Started GalleryApiApplication in X.XXX seconds
```

### 7. 测试登录

在浏览器访问:
- https://gallery.vie-vibe.cn
- 尝试登录

## 完整诊断流程

### 步骤1: 检查 Nginx 状态

```bash
systemctl status nginx
nginx -t  # 测试配置
```

### 步骤2: 检查后端连接

```bash
# 测试 Nginx -> API 连接
curl http://localhost:8080/actuator/health

# 如果返回 Connection refused
# 说明 API 服务未运行
```

### 步骤3: 查看 API 日志

```bash
# Docker
docker-compose logs api --tail=100

# systemd
journalctl -u gallery-api -n 100

# 查找关键错误
grep -i "error\|exception\|failed" /var/log/gallery-api.log
```

### 步骤4: 检查环境变量

```bash
# 检查 .env.local 是否存在
ls -la /opt/vie-gallery/.env.local

# 检查内容
cat /opt/vie-gallery/.env.local | grep GALLERY_SECURITY

# 应该看到
GALLERY_SECURITY_ENCRYPTION_SECRET=...
GALLERY_SECURITY_ENCRYPTION_SALT=...
GALLERY_SECURITY_JWT_SECRET=...
```

### 步骤5: 手动测试启动

```bash
# 加载环境变量
source /opt/vie-gallery/.env.local

# 测试环境变量
echo $GALLERY_SECURITY_ENCRYPTION_SECRET

# 手动启动测试
cd /opt/vie-gallery/apps/gallery-api/gallery-api-boot/target
java -jar gallery-api-boot-*.jar

# 查看启动日志中是否有错误
```

## 常见错误及解决方案

### 错误1: "Encryption secret must be configured"

**原因**: 缺少 `GALLERY_SECURITY_ENCRYPTION_SECRET` 环境变量

**解决**:
```bash
# 生成密钥
bash scripts/generate-security-keys.sh

# 或手动生成
openssl rand -base64 32
```

### 错误2: "JWT secret must be configured"

**原因**: 缺少 `GALLERY_SECURITY_JWT_SECRET` 环境变量

**解决**:
```bash
# 生成 JWT 密钥
openssl rand -base64 32

# 添加到 .env.local
echo "GALLERY_SECURITY_JWT_SECRET=<生成的值>" >> .env.local
```

### 错误3: 容器一直重启

**原因**: 启动失败导致容器循环重启

**解决**:
```bash
# 查看详细日志
docker-compose logs api --tail=100 -f

# 停止容器
docker-compose down

# 修复环境变量后重新启动
docker-compose up -d
```

### 错误4: Docker 镜像过时

**原因**: 使用旧版本镜像,不包含新代码

**解决**:
```bash
# 拉取最新代码
git pull origin main

# 重新构建镜像
docker-compose build api

# 启动
docker-compose up -d
```

## 临时回滚方案

如果需要快速恢复服务:

```bash
# 1. 回滚到之前的版本
cd /opt/vie-gallery
git log --oneline -10
git checkout <上一个稳定版本的commit>

# 2. 重新构建
docker-compose build api
docker-compose up -d

# 3. 验证
curl http://localhost:8080/actuator/health
```

## 预防措施

### 1. 添加健康检查

在 `docker-compose.yml` 中:

```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### 2. 配置监控告警

```bash
# 使用 Prometheus + Alertmanager
# 监控指标: up{job="gallery-api"}
# 告警规则: up == 0 持续 1 分钟
```

### 3. 自动化部署脚本

使用 `scripts/deploy-security.sh` 进行部署,自动处理:
- 环境检查
- 密钥生成
- 服务重启
- 健康验证

## 验证清单

部署后确认:

- [ ] API 服务正在运行: `docker-compose ps` 或 `systemctl status gallery-api`
- [ ] 健康检查通过: `curl http://localhost:8080/actuator/health` 返回 `{"status":"UP"}`
- [ ] 日志无错误: `docker-compose logs api --tail=50` 无 ERROR/Exception
- [ ] 登录功能正常: 访问 https://gallery.vie-vibe.cn 可以登录
- [ ] URL 签名生效: API 响应包含 `?expires=&uid=&sig=` 参数

## 需要帮助?

如果问题仍未解决:

1. **收集诊断信息**:
```bash
# 保存到文件
docker-compose logs api > api-logs.txt
systemctl status nginx > nginx-status.txt
cat .env.local > env-config.txt  # 记得删除敏感信息
```

2. **检查相关文档**:
- [SECURITY-ENCRYPTION.md](./SECURITY-ENCRYPTION.md) - 安全配置详细说明
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 完整部署指南

3. **联系技术支持**: tech@vie-vibe.cn
