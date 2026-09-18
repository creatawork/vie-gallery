# VIE Gallery 快速部署指南

## 🚀 5 分钟快速部署

### 前提条件
- ✅ 服务器已配置完成（Docker、Nginx 已安装）
- ✅ DNS 已解析：gallery.vie-vibe.cn -> 43.130.250.22
- ✅ SSH 免密登录已配置

### 步骤 1：配置 GitHub Secrets

1. 访问仓库 **Settings** > **Secrets and variables** > **Actions**
2. 添加以下 3 个必需的 Secrets：

| 名称 | 值 |
|------|-----|
| `SERVER_HOST` | `43.130.250.22` |
| `SERVER_USER` | `ubuntu` |
| `SERVER_SSH_KEY` | 你的 SSH 私钥（完整内容，包括 BEGIN 和 END 行） |

**如何获取 SSH 私钥：**
```bash
cat ~/.ssh/id_rsa
```

### 步骤 2：推送代码并触发部署

```bash
# 推送到 main 分支会自动触发部署
git push origin main
```

或手动触发：
1. 进入 GitHub **Actions** 标签
2. 选择 **Deploy to Production** 工作流
3. 点击 **Run workflow** > **Run workflow**

### 步骤 3：等待部署完成

部署通常需要 5-10 分钟，包括：
- ✅ 构建前端 (Admin & Viewer)
- ✅ 构建后端 (Spring Boot API)
- ✅ 构建 Docker 镜像
- ✅ 传输文件到服务器
- ✅ 启动 Docker 容器
- ✅ 配置 Nginx

### 步骤 4：验证部署

访问以下 URL 验证服务：

```bash
# 测试 API
curl http://gallery.vie-vibe.cn/api/health

# 访问管理端
http://gallery.vie-vibe.cn/app/

# 访问展示端
http://gallery.vie-vibe.cn/g/
```

## 🛠️ 故障排查

### 部署失败？

1. **检查 GitHub Actions 日志**
   - 进入 Actions 标签查看详细错误信息

2. **SSH 连接失败**
   - 确认 SERVER_SSH_KEY 包含完整私钥（包括 BEGIN 和 END 行）
   - 确认服务器 SSH 端口是 22

3. **Docker 容器启动失败**
   ```bash
   ssh ubuntu@43.130.250.22
   cd ~/vie-gallery/infra
   docker compose -f docker-compose.production.yml logs
   ```

4. **Nginx 配置错误**
   ```bash
   ssh ubuntu@43.130.250.22
   sudo nginx -t
   sudo systemctl status nginx
   ```

## 📦 手动部署（备选方案）

如果 GitHub Actions 不可用，可以使用本地部署脚本：

```bash
chmod +x deploy.sh
./deploy.sh
```

**注意**：需要本地安装 Docker、Node.js 和 Maven。

## 📚 详细文档

- [完整部署配置指南](./deployment-setup.md)
- [GitHub Secrets 设置步骤](../GITHUB_SECRETS_SETUP.md)

## 🔐 安全提示

⚠️ **生产环境必须修改默认密码！**

1. 在服务器创建 `.env` 文件：
   ```bash
   ssh ubuntu@43.130.250.22
   cd ~/vie-gallery/infra
   cp .env.production.example .env
   nano .env  # 修改所有密码
   ```

2. 重启服务应用新密码：
   ```bash
   docker compose -f docker-compose.production.yml down
   docker compose -f docker-compose.production.yml up -d
   ```

## 🎯 下一步

- [ ] 配置 HTTPS (Let's Encrypt)
- [ ] 设置数据库备份
- [ ] 配置监控和告警
- [ ] 优化性能和缓存
