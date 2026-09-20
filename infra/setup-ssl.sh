#!/bin/bash
# SSL证书安装和配置脚本
# 用于: gallery.vie-vibe.cn

set -e

echo "==================================="
echo "SSL证书配置脚本 - Let's Encrypt"
echo "==================================="

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
    echo "错误: 请使用root权限运行此脚本"
    echo "使用: sudo bash setup-ssl.sh"
    exit 1
fi

# 1. 安装certbot
echo ""
echo "步骤 1/5: 安装 Certbot..."
if command -v certbot &> /dev/null; then
    echo "✓ Certbot 已安装"
else
    echo "正在安装 Certbot..."
    apt update
    apt install -y certbot python3-certbot-nginx
    echo "✓ Certbot 安装完成"
fi

# 2. 创建webroot目录
echo ""
echo "步骤 2/5: 创建证书验证目录..."
mkdir -p /var/www/certbot
chmod -R 755 /var/www/certbot
echo "✓ 目录创建完成: /var/www/certbot"

# 3. 备份现有nginx配置
echo ""
echo "步骤 3/5: 备份当前nginx配置..."
NGINX_CONF="/etc/nginx/sites-available/gallery.vie-vibe.cn"
if [ -f "$NGINX_CONF" ]; then
    cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d-%H%M%S)"
    echo "✓ 已备份到: ${NGINX_CONF}.backup.$(date +%Y%m%d-%H%M%S)"
fi

# 4. 临时配置nginx用于证书获取
echo ""
echo "步骤 4/5: 配置nginx用于证书验证..."
cat > /etc/nginx/sites-available/gallery-temp.conf << 'EOF'
server {
    listen 80;
    server_name gallery.vie-vibe.cn;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://localhost:8088;
        proxy_set_header Host $host;
    }
}
EOF

ln -sf /etc/nginx/sites-available/gallery-temp.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
echo "✓ 临时配置已应用"

# 5. 获取SSL证书
echo ""
echo "步骤 5/5: 获取SSL证书..."
certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email your-email@example.com \
    --agree-tos \
    --no-eff-email \
    -d gallery.vie-vibe.cn

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ SSL证书获取成功!"
    echo ""
    echo "证书位置:"
    echo "  - 完整证书链: /etc/letsencrypt/live/gallery.vie-vibe.cn/fullchain.pem"
    echo "  - 私钥: /etc/letsencrypt/live/gallery.vie-vibe.cn/privkey.pem"
    echo ""
    
    # 6. 配置自动续期
    echo "配置自动续期..."
    
    # 创建续期钩子脚本
    cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'HOOK_EOF'
#!/bin/bash
systemctl reload nginx
HOOK_EOF
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
    
    # 测试续期命令
    echo "测试证书续期配置..."
    certbot renew --dry-run
    
    if [ $? -eq 0 ]; then
        echo "✓ 自动续期配置成功"
        echo ""
        echo "续期计划已设置（systemd timer）:"
        systemctl list-timers | grep certbot || echo "  certbot会自动检查续期（每天2次）"
    fi
    
    echo ""
    echo "==================================="
    echo "下一步操作:"
    echo "==================================="
    echo "1. 上传新的nginx配置文件到服务器:"
    echo "   scp infra/nginx-prod-ssl.conf user@server:/etc/nginx/sites-available/gallery.vie-vibe.cn"
    echo ""
    echo "2. 在服务器上应用配置:"
    echo "   sudo nginx -t"
    echo "   sudo systemctl reload nginx"
    echo ""
    echo "3. 测试HTTPS访问:"
    echo "   https://gallery.vie-vibe.cn"
    echo ""
    echo "4. 检查SSL评级:"
    echo "   https://www.ssllabs.com/ssltest/analyze.html?d=gallery.vie-vibe.cn"
    echo ""
else
    echo "❌ 证书获取失败，请检查:"
    echo "  1. 域名DNS是否正确指向服务器IP"
    echo "  2. 防火墙是否允许80端口访问"
    echo "  3. nginx是否正常运行"
fi
