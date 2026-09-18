# VIE Gallery 部署配置指南

## 服务器信息

- **域名**: gallery.vie-vibe.cn
- **服务器 IP**: 43.130.250.22
- **用户名**: ubuntu
- **操作系统**: Ubuntu 22.04 LTS

## 已完成的服务器配置

### 1. 已安装软件
- ✅ Docker & Docker Compose
- ✅ Nginx

### 2. 目录结构
```
/home/ubuntu/vie-gallery/
├── admin/           # Admin UI 构建产物
├── viewer/          # Viewer UI 构建产物
├── infra/           # Docker Compose 和 Nginx 配置
│   ├── docker-compose.production.yml
│   ├── nginx-admin.conf
│   ├── nginx-viewer.conf
│   └── nginx-prod.conf
└── api/             # API Docker 镜像（临时文件）
```

### 3. Nginx 配置
- 配置文件位置: `/etc/nginx/sites-available/vie-gallery`
- 已启用并加载配置
- 监听端口 80，域名 gallery.vie-vibe.cn

### 4. 端口映射
- API: 8088 (容器内 8080)
- Admin UI: 5173 (通过 Nginx 容器)
- Viewer UI: 5174 (通过 Nginx 容器)
- MySQL: 3306
- Redis: 6379
- MinIO API: 9000
- MinIO Console: 9001

## GitHub Secrets 配置

在 GitHub 仓库设置中添加以下 Secrets (Settings > Secrets and variables > Actions):

### 必需的 Secrets

1. **SERVER_HOST**
   ```
   43.130.250.22
   ```

2. **SERVER_USER**
   ```
   ubuntu
   ```

3. **SERVER_SSH_KEY**
   - 复制本地的 SSH 私钥内容
   - Windows 路径通常在: `C:\Users\<用户名>\.ssh\id_rsa`
   - 完整内容包括 `-----BEGIN OPENSSH PRIVATE KEY-----` 到 `-----END OPENSSH PRIVATE KEY-----`

### 可选的 Secrets (用于环境变量)

4. **MYSQL_ROOT_PASSWORD** (可选，默认: vie_gallery_root_2026)
5. **MYSQL_PASSWORD** (可选，默认: vie_password_2026)
6. **MINIO_ROOT_USER** (可选，默认: minioadmin)
7. **MINIO_ROOT_PASSWORD** (可选，默认: minioadmin123)

## 部署方式

### 方式一：GitHub Actions 自动部署 (推荐)

1. 配置好上述 GitHub Secrets
2. 推送代码到 `main` 分支或手动触发工作流
3. GitHub Actions 会自动执行以下步骤：
   - 构建前端 (Admin & Viewer)
   - 构建后端 (Spring Boot API)
   - 构建 Docker 镜像
   - 传输文件到服务器
   - 启动服务

### 方式二：本地手动部署

使用提供的 `deploy.sh` 脚本：

```bash
chmod +x deploy.sh
./deploy.sh
```

**注意**: 此脚本需要：
- 本地已配置 SSH 免密登录
- 本地已安装 Docker
- 本地已安装 Node.js 和 Maven

## 首次部署检查清单

- [ ] DNS 解析已配置 (gallery.vie-vibe.cn -> 43.130.250.22)
- [ ] GitHub Secrets 已配置完成
- [ ] 服务器防火墙已开放端口：80, 8088, 5173, 5174
- [ ] SSH 密钥已添加到 GitHub Secrets
- [ ] 触发首次部署工作流
- [ ] 验证服务可访问：
  - http://gallery.vie-vibe.cn/api/health
  - http://gallery.vie-vibe.cn/app/
  - http://gallery.vie-vibe.cn/g/

## 部署后验证

### 1. 检查 Docker 容器状态
```bash
ssh ubuntu@43.130.250.22
cd ~/vie-gallery/infra
docker compose -f docker-compose.production.yml ps
```

所有容器应该处于 `healthy` 或 `running` 状态。

### 2. 检查日志
```bash
# API 日志
docker logs vie-gallery-api

# MySQL 日志
docker logs vie-gallery-mysql

# Redis 日志
docker logs vie-gallery-redis
```

### 3. 测试端点
```bash
# API 健康检查
curl http://gallery.vie-vibe.cn/api/health

# 测试前端
curl -I http://gallery.vie-vibe.cn/app/
curl -I http://gallery.vie-vibe.cn/g/
```

## 常见问题

### 1. Docker 镜像拉取失败
如果服务器网络不佳，可以预先拉取镜像：
```bash
ssh ubuntu@43.130.250.22
docker pull mysql:8.0
docker pull redis:7-alpine
docker pull minio/minio:latest
docker pull nginx:alpine
```

### 2. 容器启动失败
检查日志并确认环境变量配置正确：
```bash
docker logs <container-name>
```

### 3. Nginx 配置错误
验证配置：
```bash
sudo nginx -t
sudo systemctl status nginx
```

## 后续优化建议

1. **HTTPS 配置**: 使用 Let's Encrypt 配置 SSL 证书
2. **数据备份**: 设置 MySQL 和 MinIO 的定期备份
3. **监控**: 添加服务监控和告警
4. **日志管理**: 配置日志轮转和集中日志管理
5. **性能优化**: 根据实际负载调整容器资源限制
6. **安全加固**: 
   - 修改默认密码
   - 配置防火墙规则
   - 定期更新依赖
