# Gallery API 部署指南

## 快速部署安全方案

### 自动化部署 (推荐)

在服务器上运行自动化部署脚本:

```bash
# 1. SSH 登录服务器
ssh root@your-server-ip

# 2. 进入项目目录
cd /opt/vie-gallery

# 3. 拉取最新代码
git pull origin main

# 4. 运行部署脚本
bash scripts/deploy-security.sh
```

部署脚本会自动完成:
- ✅ 环境检查
- ✅ 备份现有配置和应用
- ✅ 生成安全密钥 (如果不存在)
- ✅ 编译新版本
- ✅ 停止旧服务
- ✅ 启动新服务
- ✅ 健康检查和安全验证

### 手动部署

如果需要手动控制每一步:

#### 1. 服务器准备

```bash
# SSH 登录
ssh root@your-server-ip

# 进入项目目录
cd /opt/vie-gallery

# 备份当前配置
cp .env.local .env.local.bak.$(date +%Y%m%d-%H%M%S)
```

#### 2. 更新代码

```bash
# 拉取最新代码
git fetch origin
git pull origin main

# 查看变更
git log -1 --stat
```

#### 3. 生成安全密钥

```bash
# 运行密钥生成脚本
bash scripts/generate-security-keys.sh

# 选择 'y' 保存到 .env.local
```

**重要**: 生产环境应使用独立的密钥,不要与开发环境共用!

#### 4. 配置环境变量

检查 `.env.local` 确保包含以下关键配置:

```bash
# 查看当前配置
cat .env.local | grep GALLERY_SECURITY

# 应该看到
GALLERY_SECURITY_ENCRYPTION_SECRET=...
GALLERY_SECURITY_ENCRYPTION_SALT=...
GALLERY_SECURITY_JWT_SECRET=...
```

#### 5. 编译应用

```bash
cd apps/gallery-api

# 清理并编译
mvn clean package -DskipTests

# 验证编译产物
ls -lh gallery-api-boot/target/*.jar
```

#### 6. 停止旧服务

根据你的部署方式选择:

**使用 systemd**:
```bash
systemctl stop gallery-api
systemctl status gallery-api
```

**使用 Docker Compose**:
```bash
docker-compose stop api
```

**直接运行的进程**:
```bash
# 找到进程ID
ps aux | grep gallery-api

# 优雅停止
kill <PID>

# 强制停止 (如果需要)
kill -9 <PID>
```

#### 7. 启动新服务

**使用 systemd**:
```bash
systemctl start gallery-api
systemctl status gallery-api

# 查看日志
journalctl -u gallery-api -f
```

**使用 Docker Compose**:
```bash
docker-compose up -d api

# 查看日志
docker-compose logs -f api
```

**直接运行**:
```bash
# 加载环境变量
source .env.local

# 启动应用
cd apps/gallery-api/gallery-api-boot/target
nohup java -jar gallery-api-boot-*.jar > /var/log/gallery-api.log 2>&1 &

# 保存进程ID
echo $! > /opt/vie-gallery/gallery-api.pid
```

#### 8. 验证部署

```bash
# 健康检查
curl http://localhost:8080/actuator/health

# 应该返回
{"status":"UP"}

# 测试 API (需要登录 token)
curl http://localhost:8080/api/galleries \
  -H "Cookie: VIE_SESSION=your-session-token"

# 检查响应中是否包含签名URL
# 应该看到 URL 包含 expires, uid, sig 参数
```

## Docker 部署

### 更新 docker-compose.yml

确保环境变量正确传递:

```yaml
services:
  api:
    image: vie-gallery-api:latest
    environment:
      - GALLERY_SECURITY_ENCRYPTION_SECRET=${GALLERY_SECURITY_ENCRYPTION_SECRET}
      - GALLERY_SECURITY_ENCRYPTION_SALT=${GALLERY_SECURITY_ENCRYPTION_SALT}
      - GALLERY_SECURITY_JWT_SECRET=${GALLERY_SECURITY_JWT_SECRET}
      - PHOTO_URL_EXPIRY=3600
    env_file:
      - .env.local
```

### 部署步骤

```bash
# 1. 生成密钥
bash scripts/generate-security-keys.sh

# 2. 重新构建镜像
docker-compose build api

# 3. 停止旧容器
docker-compose stop api

# 4. 启动新容器
docker-compose up -d api

# 5. 查看日志
docker-compose logs -f api

# 6. 验证部署
docker-compose exec api curl http://localhost:8080/actuator/health
```

## 回滚方案

如果新版本出现问题,可以快速回滚:

### 使用备份回滚

```bash
# 1. 停止当前服务
systemctl stop gallery-api

# 2. 恢复备份的配置
BACKUP_DATE="20260920-113000"  # 替换为你的备份时间
cp /opt/backups/vie-gallery/$BACKUP_DATE/.env.local.bak .env.local

# 3. 回滚代码
git reset --hard HEAD~1

# 4. 重新编译
cd apps/gallery-api
mvn clean package -DskipTests

# 5. 启动服务
systemctl start gallery-api
```

### Git 版本回滚

```bash
# 查看提交历史
git log --oneline -10

# 回滚到特定版本
git checkout <commit-hash>

# 或回滚到上一个版本
git checkout HEAD~1

# 重新编译部署
mvn clean package -DskipTests
systemctl restart gallery-api
```

## 监控和日志

### 查看应用日志

**systemd**:
```bash
# 实时日志
journalctl -u gallery-api -f

# 最近100行
journalctl -u gallery-api -n 100

# 错误日志
journalctl -u gallery-api -p err
```

**Docker**:
```bash
# 实时日志
docker-compose logs -f api

# 最近100行
docker-compose logs --tail=100 api
```

### 监控关键指标

```bash
# 检查签名验证失败次数
curl http://localhost:8080/actuator/metrics/gallery.security.signature.failures

# 检查加密操作次数
curl http://localhost:8080/actuator/metrics/gallery.security.encryption.operations

# 内存使用
curl http://localhost:8080/actuator/metrics/jvm.memory.used
```

### 日志关键字

部署后关注以下日志:

**正常日志**:
```
gallery_upload_accepted
signature_verified
encryption_successful
```

**错误日志**:
```
signature_verification_failed
encryption_failed
Encryption secret must be configured
```

## 常见问题

### Q1: 服务启动失败 "Encryption secret must be configured"

**原因**: 环境变量未正确加载

**解决**:
```bash
# 检查 .env.local 是否存在
ls -la .env.local

# 检查环境变量是否加载
echo $GALLERY_SECURITY_ENCRYPTION_SECRET

# 手动加载
source .env.local

# 或在 systemd 服务中配置
# /etc/systemd/system/gallery-api.service
[Service]
EnvironmentFile=/opt/vie-gallery/.env.local
```

### Q2: 编译失败

**原因**: Maven 依赖下载问题

**解决**:
```bash
# 清理 Maven 缓存
mvn dependency:purge-local-repository

# 使用国内镜像
# ~/.m2/settings.xml
<mirror>
  <id>aliyun</id>
  <mirrorOf>central</mirrorOf>
  <url>https://maven.aliyun.com/repository/public</url>
</mirror>
```

### Q3: URL 签名验证失败

**原因**: 服务器时间不同步

**解决**:
```bash
# 安装 NTP
apt-get install ntpdate  # Ubuntu/Debian
yum install ntpdate       # CentOS/RHEL

# 同步时间
ntpdate pool.ntp.org

# 启用自动时间同步
timedatectl set-ntp true
```

### Q4: 性能下降

**原因**: 加密操作消耗CPU

**优化**:
1. 增加 JVM 内存: `-Xmx2g -Xms2g`
2. 启用 G1 GC: `-XX:+UseG1GC`
3. 启用 URL 缓存 (Redis)

## 生产环境检查清单

部署到生产前确认:

- [ ] 已生成独立的生产密钥 (不与开发环境共用)
- [ ] 密钥已保存到密钥管理服务 (AWS Secrets Manager / Azure Key Vault)
- [ ] 已启用 HTTPS/TLS
- [ ] SESSION_COOKIE_SECURE=true
- [ ] 防火墙规则已配置
- [ ] 数据库备份已验证
- [ ] 监控告警已配置
- [ ] 日志收集已配置 (ELK / CloudWatch)
- [ ] 负载测试已完成
- [ ] 回滚方案已准备

## 安全加固建议

### 1. 启用 HTTPS

参考: [infra/SSL-SETUP-GUIDE.md](../infra/SSL-SETUP-GUIDE.md)

```bash
# 安装 Let's Encrypt 证书
bash infra/setup-ssl.sh your-domain.com
```

### 2. 配置 Nginx 反向代理

```bash
# 复制配置文件
cp infra/nginx-prod-ssl.conf /etc/nginx/sites-available/gallery-api

# 替换域名
sed -i 's/your-domain.com/actual-domain.com/g' /etc/nginx/sites-available/gallery-api

# 启用站点
ln -s /etc/nginx/sites-available/gallery-api /etc/nginx/sites-enabled/

# 测试配置
nginx -t

# 重载配置
systemctl reload nginx
```

### 3. 防火墙配置

```bash
# 只允许 Nginx 访问应用
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 8080/tcp  # 禁止直接访问应用端口
ufw enable
```

### 4. 配置监控

使用 Prometheus + Grafana:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'gallery-api'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: '/actuator/prometheus'
```

## 下一步

- 📖 阅读安全文档: [SECURITY-ENCRYPTION.md](./SECURITY-ENCRYPTION.md)
- 🔐 配置 SSL: [SSL-SETUP-GUIDE.md](../infra/SSL-SETUP-GUIDE.md)
- 📊 配置监控: [MONITORING.md](./MONITORING.md)
- 🔄 设置 CI/CD: [CI-CD-SETUP.md](./CI-CD-SETUP.md)

## 技术支持

遇到问题:
1. 查看日志: `journalctl -u gallery-api -n 100`
2. 检查健康状态: `curl http://localhost:8080/actuator/health`
3. 查看文档: [docs/](../docs/)
4. 联系团队: tech@vie.vibe.cn
