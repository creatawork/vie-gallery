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
scp infra/nginx-prod.conf ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_PATH}/infra/

# 传输 Docker 镜像
scp /tmp/vie-gallery-api.tar.gz ${SERVER_USER}@${SERVER_HOST}:${DEPLOY_PATH}/

echo "6. 加载 Docker 镜像并启动服务..."
ssh ${SERVER_USER}@${SERVER_HOST} << 'EOF'
cd /home/ubuntu/vie-gallery
docker load < vie-gallery-api.tar.gz
rm vie-gallery-api.tar.gz
cd infra
docker compose -f docker-compose.production.yml down
docker compose -f docker-compose.production.yml up -d
EOF

echo "7. 配置 Nginx..."
ssh ${SERVER_USER}@${SERVER_HOST} << 'EOF'
sudo cp /home/ubuntu/vie-gallery/infra/nginx-prod.conf /etc/nginx/sites-available/vie-gallery
sudo ln -sf /etc/nginx/sites-available/vie-gallery /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
EOF

echo "=== 部署完成 ==="
echo "访问: http://gallery.vie-vibe.cn"
