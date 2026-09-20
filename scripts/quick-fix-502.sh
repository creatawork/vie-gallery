#!/bin/bash

# 快速修复 502 错误脚本
# 自动诊断并修复因缺少安全环境变量导致的 API 服务故障

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_DIR="/opt/vie-gallery"

echo -e "${BLUE}======================================"
echo "Gallery API 502 错误快速修复"
echo -e "======================================${NC}"
echo ""

# 检查是否为root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ 请使用 root 用户运行${NC}"
    exit 1
fi

echo "1️⃣  诊断问题..."

# 检查项目目录
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ 项目目录不存在: $PROJECT_DIR${NC}"
    exit 1
fi

cd "$PROJECT_DIR"

# 检查服务状态
echo ""
echo "检查服务状态..."

if command -v docker-compose &> /dev/null; then
    CONTAINER_STATUS=$(docker-compose ps api | grep api | awk '{print $4}' || echo "")
    echo -e "容器状态: ${YELLOW}$CONTAINER_STATUS${NC}"
    
    if [ "$CONTAINER_STATUS" != "Up" ]; then
        echo -e "${RED}⚠️  API 容器未运行${NC}"
    fi
    
    # 检查容器日志
    echo ""
    echo "最近的错误日志:"
    docker-compose logs api --tail=20 | grep -i "error\|exception\|failed" || echo "无错误日志"
fi

# 检查环境变量配置
echo ""
echo "2️⃣  检查安全配置..."

if [ ! -f "$PROJECT_DIR/.env.local" ]; then
    echo -e "${RED}❌ 缺少 .env.local 文件${NC}"
    MISSING_ENV=true
else
    # 检查必需的环境变量
    if ! grep -q "GALLERY_SECURITY_ENCRYPTION_SECRET" "$PROJECT_DIR/.env.local"; then
        echo -e "${RED}❌ 缺少 GALLERY_SECURITY_ENCRYPTION_SECRET${NC}"
        MISSING_ENV=true
    else
        echo -e "${GREEN}✅ GALLERY_SECURITY_ENCRYPTION_SECRET 已配置${NC}"
    fi
    
    if ! grep -q "GALLERY_SECURITY_ENCRYPTION_SALT" "$PROJECT_DIR/.env.local"; then
        echo -e "${RED}❌ 缺少 GALLERY_SECURITY_ENCRYPTION_SALT${NC}"
        MISSING_ENV=true
    else
        echo -e "${GREEN}✅ GALLERY_SECURITY_ENCRYPTION_SALT 已配置${NC}"
    fi
    
    if ! grep -q "GALLERY_SECURITY_JWT_SECRET" "$PROJECT_DIR/.env.local"; then
        echo -e "${RED}❌ 缺少 GALLERY_SECURITY_JWT_SECRET${NC}"
        MISSING_ENV=true
    else
        echo -e "${GREEN}✅ GALLERY_SECURITY_JWT_SECRET 已配置${NC}"
    fi
fi

# 如果缺少环境变量,生成并配置
if [ "$MISSING_ENV" = true ]; then
    echo ""
    echo "3️⃣  生成安全密钥..."
    
    if [ -f "$PROJECT_DIR/scripts/generate-security-keys.sh" ]; then
        # 自动生成密钥
        bash "$PROJECT_DIR/scripts/generate-security-keys.sh" <<< "y"
        echo -e "${GREEN}✅ 密钥已生成并保存到 .env.local${NC}"
    else
        echo -e "${YELLOW}⚠️  密钥生成脚本不存在,手动生成...${NC}"
        
        # 手动生成密钥
        ENCRYPTION_SECRET=$(openssl rand -base64 32)
        ENCRYPTION_SALT=$(openssl rand -hex 16)
        JWT_SECRET=$(openssl rand -base64 32)
        
        # 保存到 .env.local
        cat >> "$PROJECT_DIR/.env.local" << EOF

# 安全配置 - 生成于 $(date)
GALLERY_SECURITY_ENCRYPTION_SECRET=$ENCRYPTION_SECRET
GALLERY_SECURITY_ENCRYPTION_SALT=$ENCRYPTION_SALT
GALLERY_SECURITY_JWT_SECRET=$JWT_SECRET
EOF
        
        echo -e "${GREEN}✅ 密钥已生成并保存${NC}"
    fi
else
    echo -e "${GREEN}✅ 所有必需的环境变量已配置${NC}"
fi

# 更新 docker-compose.yml
echo ""
echo "4️⃣  更新 Docker Compose 配置..."

if [ -f "$PROJECT_DIR/docker-compose.yml" ]; then
    # 检查是否已包含环境变量配置
    if ! grep -q "GALLERY_SECURITY_ENCRYPTION_SECRET" "$PROJECT_DIR/docker-compose.yml"; then
        echo -e "${YELLOW}⚠️  docker-compose.yml 需要手动更新${NC}"
        echo "请在 api 服务的 environment 部分添加:"
        echo ""
        echo "    - GALLERY_SECURITY_ENCRYPTION_SECRET=\${GALLERY_SECURITY_ENCRYPTION_SECRET}"
        echo "    - GALLERY_SECURITY_ENCRYPTION_SALT=\${GALLERY_SECURITY_ENCRYPTION_SALT}"
        echo "    - GALLERY_SECURITY_JWT_SECRET=\${GALLERY_SECURITY_JWT_SECRET}"
        echo ""
        
        read -p "是否自动更新 docker-compose.yml? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # 备份原文件
            cp docker-compose.yml docker-compose.yml.bak.$(date +%Y%m%d-%H%M%S)
            
            # 在 api 服务的 environment 部分添加新变量
            # 这里需要根据实际的 docker-compose.yml 结构调整
            echo -e "${YELLOW}⚠️  请手动编辑 docker-compose.yml 添加环境变量${NC}"
        fi
    else
        echo -e "${GREEN}✅ docker-compose.yml 已包含安全配置${NC}"
    fi
fi

# 重启服务
echo ""
echo "5️⃣  重启 API 服务..."

if command -v docker-compose &> /dev/null; then
    echo "停止容器..."
    docker-compose stop api
    
    echo "启动容器..."
    docker-compose up -d api
    
    echo -e "${GREEN}✅ 容器已重启${NC}"
elif systemctl is-active --quiet gallery-api; then
    echo "重启 systemd 服务..."
    systemctl restart gallery-api
    echo -e "${GREEN}✅ 服务已重启${NC}"
else
    echo -e "${YELLOW}⚠️  未检测到运行的服务${NC}"
fi

# 等待服务启动
echo ""
echo "6️⃣  等待服务启动..."
sleep 15

# 验证修复
echo ""
echo "7️⃣  验证修复..."

HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/actuator/health 2>/dev/null || echo "000")

if [ "$HEALTH_CHECK" == "200" ]; then
    echo -e "${GREEN}✅ 健康检查通过!${NC}"
    echo ""
    echo -e "${GREEN}======================================"
    echo "🎉 修复完成!"
    echo -e "======================================${NC}"
    echo ""
    echo "请在浏览器测试:"
    echo "  https://gallery.vie-vibe.cn"
    echo ""
else
    echo -e "${RED}❌ 健康检查失败 (HTTP $HEALTH_CHECK)${NC}"
    echo ""
    echo "请手动检查:"
    echo "  1. 查看日志: docker-compose logs api --tail=50"
    echo "  2. 检查环境变量: cat .env.local | grep GALLERY_SECURITY"
    echo "  3. 查看详细文档: docs/TROUBLESHOOTING-502.md"
fi

echo ""
echo "日志位置:"
if command -v docker-compose &> /dev/null; then
    echo "  docker-compose logs api"
else
    echo "  journalctl -u gallery-api -f"
fi

echo ""
echo "配置文件:"
echo "  $PROJECT_DIR/.env.local"
echo "  $PROJECT_DIR/docker-compose.yml"
