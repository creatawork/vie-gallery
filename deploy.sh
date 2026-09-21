#!/bin/bash
set -e

echo "=== VIE Gallery 部署脚本 ==="

# 配置
SERVER_USER="ubuntu"
SERVER_HOST="43.130.250.22"
DEPLOY_PATH="/home/ubuntu/vie-gallery"

echo "1. 构建前端..."
cd apps/gallery-admin
npm install
npm run build
cd ../gallery-viewer
npm install
npm run build
cd ../..

echo "2. 打包后端..."
cd apps/gallery-api
mvn clean package -DskipTests
cd ../..

echo "3. 构建 Docker 镜像..."
docker build -t vie-gallery-api:latest -f infra/Dockerfile.api .

echo "4. 保存 Docker 镜像..."
docker save vie-gallery-api:latest | gzip > /tmp/vie-gallery-api.tar.gz

echo "5. 传输文件到服务器..."
ssh ${SERVER_USER}@${SERVER_HOST} "mkdir -p ${DEPLOY_PATH}/{admin,viewer,infra}"

# 传输前端构建产物
scp -r apps/gallery-admin/dist/* ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_PATH}/admin/
scp -r apps/gallery-viewer/dist/* ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_PATH}/viewer/

# 传输 infra 配置
scp infra/docker-compose.production.yml ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_PATH}/infra/
scp infra/nginx-admin.conf ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_PATH}/infra/
scp infra/nginx-viewer.conf ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_PATH}/infra/
scp infra/nginx-prod-ssl.conf ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_PATH}/infra/

# 传输 Docker 镜像
scp /tmp/vie-gallery-api.tar.gz ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_PATH}/

echo "6. 加载 Docker 镜像并启动服务..."
ssh ${SERVER_USER}@${SERVER_HOST} << 'EOF'
set -e
cd /home/ubuntu/vie-gallery
docker load < vie-gallery-api.tar.gz
rm vie-gallery-api.tar.gz
cd infra

# 环境文件预检：安全密钥或 OSS 变量缺失时 API 无法启动，表现为 502
if [ ! -f .env.production ]; then
  echo "ERROR: /home/ubuntu/vie-gallery/infra/.env.production 不存在" >&2
  exit 1
fi
for var in \
  GALLERY_SECURITY_ENCRYPTION_SECRET \
  GALLERY_SECURITY_ENCRYPTION_SALT \
  GALLERY_SECURITY_JWT_SECRET \
  ALIYUN_OSS_ENDPOINT \
  ALIYUN_OSS_ACCESS_KEY_ID \
  ALIYUN_OSS_ACCESS_KEY_SECRET \
  ALIYUN_OSS_BUCKET; do
  grep -q "^${var}=.\+" .env.production || { echo "ERROR: ${var} 缺失或为空" >&2; exit 1; }
done

# 只重建配置有变化的容器（mysql/redis/minio 保持运行）
# --env-file 必须带上，否则安全/OSS 变量为空，API 启动失败导致 502
docker compose -f docker-compose.production.yml --env-file .env.production up -d --wait --wait-timeout 240
docker compose -f docker-compose.production.yml --env-file .env.production ps
EOF

echo "7. 配置 Nginx (SSL 版)..."
ssh ${SERVER_USER}@${SERVER_HOST} << 'EOF'
sudo cp /home/ubuntu/vie-gallery/infra/nginx-prod-ssl.conf /etc/nginx/sites-available/vie-gallery
sudo ln -sf /etc/nginx/sites-available/vie-gallery /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
EOF

echo "8. 验证部署..."
ssh ${SERVER_USER}@${SERVER_HOST} "curl -fsS http://localhost:8088/actuator/health > /dev/null && echo 'API 健康: OK'"
ssh ${SERVER_USER}@${SERVER_HOST} "curl -fsS -H 'Host: gallery.vie-vibe.cn' http://localhost/api/auth/csrf > /dev/null && echo 'Nginx -> API: OK'"

echo "=== 部署完成 ==="
echo "访问: http://gallery.vie-vibe.cn"
