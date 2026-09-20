#!/bin/bash

# Gallery API 安全方案部署脚本
# 用于在服务器上部署数据加密安全方案

set -e

echo "======================================"
echo "Gallery API 安全方案部署"
echo "======================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
PROJECT_DIR="/opt/vie-gallery"
SERVICE_NAME="gallery-api"
BACKUP_DIR="/opt/backups/vie-gallery"

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ 请使用 root 用户运行此脚本${NC}"
    exit 1
fi

echo "1️⃣  检查服务器环境..."

# 检查必要工具
command -v git >/dev/null 2>&1 || { echo -e "${RED}❌ 需要安装 git${NC}"; exit 1; }
command -v mvn >/dev/null 2>&1 || { echo -e "${RED}❌ 需要安装 maven${NC}"; exit 1; }
command -v java >/dev/null 2>&1 || { echo -e "${RED}❌ 需要安装 Java 17+${NC}"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo -e "${RED}❌ 需要安装 openssl${NC}"; exit 1; }

echo -e "${GREEN}✅ 环境检查通过${NC}"
echo ""

echo "2️⃣  创建备份..."

# 创建备份目录
mkdir -p "$BACKUP_DIR/$(date +%Y%m%d-%H%M%S)"

# 备份当前配置
if [ -f "$PROJECT_DIR/.env.local" ]; then
    cp "$PROJECT_DIR/.env.local" "$BACKUP_DIR/$(date +%Y%m%d-%H%M%S)/.env.local.bak"
    echo -e "${GREEN}✅ 已备份现有配置${NC}"
fi

# 备份当前运行的JAR
if [ -f "$PROJECT_DIR/apps/gallery-api/gallery-api-boot/target/*.jar" ]; then
    cp "$PROJECT_DIR/apps/gallery-api/gallery-api-boot/target/"*.jar "$BACKUP_DIR/$(date +%Y%m%d-%H%M%S)/" 2>/dev/null || true
    echo -e "${GREEN}✅ 已备份现有应用${NC}"
fi

echo ""

echo "3️⃣  拉取最新代码..."

cd "$PROJECT_DIR"

# 检查工作区是否干净
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠️  检测到未提交的本地变更,将尝试保存${NC}"
    git stash save "Auto-stash before security deployment $(date +%Y%m%d-%H%M%S)"
fi

# 拉取最新代码
git fetch origin
git pull origin main

echo -e "${GREEN}✅ 代码已更新到最新版本${NC}"
echo ""

echo "4️⃣  生成安全密钥..."

# 检查是否已有密钥配置
if [ -f "$PROJECT_DIR/.env.local" ] && grep -q "GALLERY_SECURITY_ENCRYPTION_SECRET" "$PROJECT_DIR/.env.local"; then
    echo -e "${YELLOW}⚠️  检测到已有安全密钥配置${NC}"
    read -p "是否重新生成密钥? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "跳过密钥生成,使用现有密钥"
    else
        echo "生成新密钥..."
        bash "$PROJECT_DIR/scripts/generate-security-keys.sh" <<< "y"
    fi
else
    echo "生成新密钥..."
    bash "$PROJECT_DIR/scripts/generate-security-keys.sh" <<< "y"
fi

echo -e "${GREEN}✅ 密钥配置完成${NC}"
echo ""

echo "5️⃣  编译应用..."

cd "$PROJECT_DIR/apps/gallery-api"

# 清理并编译
mvn clean package -DskipTests

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 编译失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 编译成功${NC}"
echo ""

echo "6️⃣  停止旧服务..."

# 停止服务 (根据你的部署方式调整)
if systemctl is-active --quiet "$SERVICE_NAME"; then
    systemctl stop "$SERVICE_NAME"
    echo -e "${GREEN}✅ 服务已停止${NC}"
elif [ -f "$PROJECT_DIR/gallery-api.pid" ]; then
    PID=$(cat "$PROJECT_DIR/gallery-api.pid")
    if ps -p $PID > /dev/null; then
        kill $PID
        sleep 5
        if ps -p $PID > /dev/null; then
            kill -9 $PID
        fi
        echo -e "${GREEN}✅ 服务已停止 (PID: $PID)${NC}"
    fi
fi

echo ""

echo "7️⃣  部署新版本..."

# 加载环境变量
if [ -f "$PROJECT_DIR/.env.local" ]; then
    set -a
    source "$PROJECT_DIR/.env.local"
    set +a
fi

# 启动服务 (根据你的部署方式调整)
if [ -f "/etc/systemd/system/$SERVICE_NAME.service" ]; then
    systemctl start "$SERVICE_NAME"
    sleep 5
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo -e "${GREEN}✅ 服务启动成功${NC}"
    else
        echo -e "${RED}❌ 服务启动失败${NC}"
        systemctl status "$SERVICE_NAME"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  未找到 systemd 服务配置${NC}"
    echo "请手动启动服务或配置 systemd"
fi

echo ""

echo "8️⃣  验证部署..."

# 等待服务启动
echo "等待服务完全启动..."
sleep 10

# 健康检查
HEALTH_URL="http://localhost:8080/actuator/health"
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")

if [ "$HEALTH_RESPONSE" == "200" ]; then
    echo -e "${GREEN}✅ 健康检查通过${NC}"
else
    echo -e "${YELLOW}⚠️  健康检查失败 (HTTP $HEALTH_RESPONSE)${NC}"
    echo "请检查日志: journalctl -u $SERVICE_NAME -n 50"
fi

echo ""

echo "9️⃣  安全验证..."

# 测试API响应是否包含签名URL
API_URL="http://localhost:8080/api/galleries"
API_RESPONSE=$(curl -s "$API_URL" -H "Cookie: VIE_SESSION=test" 2>/dev/null || echo "")

if echo "$API_RESPONSE" | grep -q "expires="; then
    echo -e "${GREEN}✅ URL签名功能正常${NC}"
else
    echo -e "${YELLOW}⚠️  URL签名功能未检测到,可能需要登录或检查配置${NC}"
fi

echo ""

echo "======================================"
echo -e "${GREEN}🎉 部署完成!${NC}"
echo "======================================"
echo ""
echo "📝 部署信息:"
echo "   - 项目目录: $PROJECT_DIR"
echo "   - 备份目录: $BACKUP_DIR/$(date +%Y%m%d-%H%M%S)"
echo "   - 服务状态: systemctl status $SERVICE_NAME"
echo "   - 查看日志: journalctl -u $SERVICE_NAME -f"
echo ""
echo "🔐 安全配置:"
echo "   - 密钥文件: $PROJECT_DIR/.env.local"
echo "   - 加密算法: AES-256-GCM"
echo "   - URL签名: HMAC-SHA256"
echo "   - URL有效期: ${PHOTO_URL_EXPIRY:-3600}秒"
echo ""
echo "📚 文档:"
echo "   - 安全文档: $PROJECT_DIR/docs/SECURITY-ENCRYPTION.md"
echo "   - 快速开始: $PROJECT_DIR/docs/QUICK-START-SECURITY.md"
echo ""
echo "⚠️  重要提醒:"
echo "   1. 请妥善保管 .env.local 文件中的密钥"
echo "   2. 建议启用 HTTPS 以获得完整安全保护"
echo "   3. 密钥建议每90天轮换一次"
echo "   4. 监控 signature_failures 指标以检测攻击"
echo ""
