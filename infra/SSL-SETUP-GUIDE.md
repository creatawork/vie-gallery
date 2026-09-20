# SSL证书配置指南

## 概述
本指南帮助你为 `gallery.vie-vibe.cn` 配置免费的Let's Encrypt SSL证书，并实现自动续期。

## 前提条件
✅ 域名 `gallery.vie-vibe.cn` 已正确解析到服务器IP: `43.130.250.22`  
✅ 服务器80端口已开放（用于证书验证）  
✅ 服务器443端口已开放（用于HTTPS访问）  
✅ 已有root或sudo权限

## 快速部署步骤

### 方案A: 自动脚本（推荐）

1. **上传脚本到服务器**
```bash
# 在本地执行
scp infra/setup-ssl.sh root@43.130.250.22:/root/
```

2. **SSH登录服务器并执行**
```bash
ssh root@43.130.250.22
cd /root
chmod +x setup-ssl.sh

# 编辑脚本，修改邮箱地址（第63行）
nano setup-ssl.sh
# 将 your-email@example.com 改为你的真实邮箱

# 执行脚本
sudo bash setup-ssl.sh
```

3. **上传SSL版本的nginx配置**
```bash
# 在本地执行
scp infra/nginx-prod-ssl.conf root@43.130.250.22:/etc/nginx/sites-available/gallery.vie-vibe.cn
```

4. **在服务器上应用配置**
```bash
# SSH登录服务器
sudo ln -sf /etc/nginx/sites-available/gallery.vie-vibe.cn /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 方案B: 手动步骤

#### 1. 安装Certbot
```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

#### 2. 获取SSL证书
```bash
# 方式1: 使用nginx插件（自动配置）
sudo certbot --nginx -d gallery.vie-vibe.cn

# 方式2: 使用webroot方式（推荐，更灵活）
sudo mkdir -p /var/www/certbot
sudo certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email your-email@example.com \
    --agree-tos \
    --no-eff-email \
    -d gallery.vie-vibe.cn
```

#### 3. 上传并应用nginx配置
```bash
# 上传配置文件
scp infra/nginx-prod-ssl.conf root@43.130.250.22:/etc/nginx/sites-available/gallery.vie-vibe.cn

# SSH登录服务器
ssh root@43.130.250.22

# 测试配置
sudo nginx -t

# 重载nginx
sudo systemctl reload nginx
```

#### 4. 配置自动续期
```bash
# Let's Encrypt证书有效期90天，certbot会自动配置续期

# 测试自动续期
sudo certbot renew --dry-run

# 查看续期定时任务
sudo systemctl list-timers | grep certbot
```

## 验证配置

### 1. 测试HTTPS访问
```bash
# 浏览器访问
https://gallery.vie-vibe.cn

# 命令行测试
curl -I https://gallery.vie-vibe.cn
```

### 2. 检查证书信息
```bash
# 查看证书有效期
sudo certbot certificates

# 检查证书文件
sudo ls -la /etc/letsencrypt/live/gallery.vie-vibe.cn/
```

### 3. SSL安全评级
访问以下网站进行SSL配置评级：
- https://www.ssllabs.com/ssltest/analyze.html?d=gallery.vie-vibe.cn
- 目标评级: A+ 或 A

## 证书续期

### 自动续期（已配置）
Certbot会通过systemd timer每天自动检查2次，在证书到期前30天自动续期。

### 手动续期
```bash
# 手动触发续期
sudo certbot renew

# 强制续期（测试用）
sudo certbot renew --force-renewal

# 续期后重载nginx
sudo systemctl reload nginx
```

### 续期日志
```bash
# 查看续期日志
sudo journalctl -u certbot.timer
sudo cat /var/log/letsencrypt/letsencrypt.log
```

## 故障排查

### 问题1: 证书获取失败
```bash
# 检查DNS解析
nslookup gallery.vie-vibe.cn

# 检查80端口
sudo netstat -tlnp | grep :80

# 检查nginx配置
sudo nginx -t

# 查看详细错误
sudo certbot certonly --webroot -w /var/www/certbot -d gallery.vie-vibe.cn --dry-run -v
```

### 问题2: HTTPS访问失败
```bash
# 检查443端口
sudo netstat -tlnp | grep :443

# 检查防火墙
sudo ufw status
sudo iptables -L -n | grep 443

# 检查nginx错误日志
sudo tail -f /var/log/nginx/error.log
```

### 问题3: 续期失败
```bash
# 查看续期状态
sudo certbot renew --dry-run

# 检查webroot目录权限
ls -la /var/www/certbot

# 手动测试
echo "test" | sudo tee /var/www/certbot/test.txt
curl http://gallery.vie-vibe.cn/.well-known/acme-challenge/test.txt
```

## 安全建议

### 1. HSTS预加载（可选）
如果确定长期使用HTTPS，可以将域名加入HSTS预加载列表：
https://hstspreload.org/

### 2. 定期检查
```bash
# 每月检查一次SSL配置
sudo certbot certificates

# 检查nginx安全配置
curl -I https://gallery.vie-vibe.cn | grep -i "strict-transport-security"
```

### 3. 备份证书
```bash
# 备份Let's Encrypt配置
sudo tar -czf letsencrypt-backup-$(date +%Y%m%d).tar.gz /etc/letsencrypt/
```

## 文件清单

本次配置涉及的文件：
- `infra/nginx-prod-ssl.conf` - 支持HTTPS的nginx配置
- `infra/setup-ssl.sh` - SSL自动配置脚本
- `infra/SSL-SETUP-GUIDE.md` - 本文档

## 更新应用环境变量

记得更新后端应用的配置，启用secure cookie：

```yaml
# docker-compose.yml 或环境变量
SESSION_COOKIE_SECURE: "true"
```

## 参考资料

- Let's Encrypt官方文档: https://letsencrypt.org/docs/
- Certbot文档: https://certbot.eff.org/
- Mozilla SSL配置生成器: https://ssl-config.mozilla.org/
