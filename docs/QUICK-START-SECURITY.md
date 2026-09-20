# 快速启用数据加密安全方案

## 5分钟快速上手

### 1. 生成安全密钥 (1分钟)

```bash
# 进入项目根目录
cd vie-gallery

# 运行密钥生成脚本
bash scripts/generate-security-keys.sh

# 选择 'y' 保存到 .env.local
```

生成的密钥会自动保存到 `.env.local` 文件。

### 2. 配置环境变量 (1分钟)

#### 方式A: 使用 .env.local (推荐开发环境)

```bash
# 密钥已保存,无需额外操作
# 确保 .env.local 在 .gitignore 中

# 启动时加载
source .env.local
```

#### 方式B: IDE 配置

**IntelliJ IDEA**:
1. Run → Edit Configurations
2. Environment variables → 点击 📁
3. 粘贴 `.env.local` 的内容

**VS Code**:
在 `.vscode/launch.json` 添加:
```json
{
  "configurations": [{
    "envFile": "${workspaceFolder}/.env.local"
  }]
}
```

### 3. 验证配置 (1分钟)

```bash
# 编译项目
cd apps/gallery-api
mvn clean compile

# 看到 BUILD SUCCESS 即配置正确
```

### 4. 启动应用 (2分钟)

```bash
# 开发环境
mvn spring-boot:run

# 或使用 IDE 的 Run 按钮
```

应用启动后,访问 http://localhost:8080/api/galleries 验证。

### 5. 测试加密效果

**未加密响应** (旧版本):
```json
{
  "coverThumbnailUrl": "http://localhost:9000/vie-gallery/photo-123.jpg"
}
```

**加密响应** (新版本):
```json
{
  "coverThumbnailUrl": "http://localhost:9000/vie-gallery/photo-123.jpg?expires=1726819200&uid=user-abc&sig=xYz789..."
}
```

URL 现在包含:
- `expires` - 过期时间戳
- `uid` - 用户ID
- `sig` - 防篡改签名

## 生产环境部署

### 前置要求

- ✅ 已配置 HTTPS/TLS 证书
- ✅ 使用密钥管理服务 (AWS Secrets Manager / Azure Key Vault)
- ✅ 配置防火墙规则

### 部署步骤

1. **生成生产密钥** (独立的,不与开发环境共用)
```bash
bash scripts/generate-security-keys.sh
# 保存输出,稍后配置到密钥管理服务
```

2. **配置密钥管理服务**

AWS Secrets Manager 示例:
```bash
aws secretsmanager create-secret \
  --name gallery-api/encryption-secret \
  --secret-string "你生成的ENCRYPTION_SECRET"

aws secretsmanager create-secret \
  --name gallery-api/encryption-salt \
  --secret-string "你生成的ENCRYPTION_SALT"

aws secretsmanager create-secret \
  --name gallery-api/jwt-secret \
  --secret-string "你生成的JWT_SECRET"
```

3. **配置应用读取密钥**

在 `application-prod.yml` 或启动脚本中:
```yaml
gallery:
  security:
    encryption:
      secret: ${GALLERY_SECURITY_ENCRYPTION_SECRET}
      salt: ${GALLERY_SECURITY_ENCRYPTION_SALT}
    jwt:
      secret: ${GALLERY_SECURITY_JWT_SECRET}
```

4. **启用 HTTPS**

参考 [SSL-SETUP-GUIDE.md](../infra/SSL-SETUP-GUIDE.md) 配置证书。

5. **部署验证**

```bash
# 检查 HTTPS 是否启用
curl -I https://your-domain.com/api/galleries

# 应看到
# HTTP/2 200
# strict-transport-security: max-age=31536000

# 检查 URL 签名
curl https://your-domain.com/api/galleries/xxx/photos | jq '.[] | .thumbnailUrl'
# URL应包含 expires, uid, sig 参数
```

## 常见问题

### Q1: 启动报错 "Encryption secret must be configured"

**原因**: 环境变量未正确加载

**解决**:
```bash
# 检查环境变量
echo $GALLERY_SECURITY_ENCRYPTION_SECRET

# 如果为空,重新加载
source .env.local

# 或在 IDE 中检查 Environment Variables 配置
```

### Q2: URL签名验证失败

**原因**: 服务器时间不同步

**解决**:
```bash
# Linux/Mac
sudo ntpdate pool.ntp.org

# Windows
w32tm /resync
```

### Q3: 想临时禁用签名验证 (仅开发环境)

**不推荐**,但如需测试:
```yaml
# application-dev.yml
gallery:
  security:
    photo-url:
      default-expiry: 31536000  # 设置为1年
```

## 密钥轮换

建议每90天轮换一次密钥:

```bash
# 1. 生成新密钥
bash scripts/generate-security-keys.sh > new-keys.txt

# 2. 更新密钥管理服务
# (具体步骤取决于你使用的服务)

# 3. 滚动重启应用
# - 确保旧密钥仍可解密历史数据
# - 新生成的URL使用新密钥
# - 保留旧密钥30天grace period

# 4. 验证新密钥生效
curl https://your-domain.com/api/galleries/xxx/photos
```

## 监控建议

添加以下监控指标:

```yaml
# Prometheus metrics
gallery_security_signature_verifications_total
gallery_security_signature_failures_total
gallery_security_encryption_operations_total
gallery_security_encryption_failures_total
```

## 下一步

- 📖 阅读完整文档: [SECURITY-ENCRYPTION.md](./SECURITY-ENCRYPTION.md)
- 🔐 配置 SSL: [SSL-SETUP-GUIDE.md](../infra/SSL-SETUP-GUIDE.md)
- 🚀 生产部署: [DEPLOYMENT.md](./DEPLOYMENT.md)
- 📊 监控配置: [MONITORING.md](./MONITORING.md)

## 技术支持

遇到问题请查看:
1. [完整文档](./SECURITY-ENCRYPTION.md#故障排查)
2. [GitHub Issues](https://github.com/your-repo/issues)
3. 联系安全团队: security@vie.vibe.cn
