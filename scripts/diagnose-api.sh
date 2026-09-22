#!/bin/bash
# API 健康检查完整诊断脚本
# 用法: ssh 到服务器后运行 ./diagnose-api.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== VIE Gallery API 诊断工具 ===${NC}\n"

# 检查是否在正确的目录
if [ ! -f "docker-compose.production.yml" ]; then
    echo -e "${RED}错误: 请在 ~/vie-gallery/infra 目录下运行此脚本${NC}"
    exit 1
fi

echo -e "${YELLOW}[1/8] 检查 API 容器状态...${NC}"
if docker ps -a | grep vie-gallery-api | grep -q "Up"; then
    echo -e "${GREEN}✓ API 容器正在运行${NC}"
    CONTAINER_STATUS=$(docker ps -a | grep vie-gallery-api | awk '{print $7}')
    echo "  状态: $CONTAINER_STATUS"
else
    echo -e "${RED}✗ API 容器未运行${NC}"
    docker ps -a | grep vie-gallery-api || echo "  容器不存在"
fi

echo -e "\n${YELLOW}[2/8] 检查容器健康状态...${NC}"
HEALTH=$(docker inspect vie-gallery-api --format='{{.State.Health.Status}}' 2>/dev/null || echo "no-healthcheck")
if [ "$HEALTH" = "healthy" ]; then
    echo -e "${GREEN}✓ 容器健康${NC}"
elif [ "$HEALTH" = "unhealthy" ]; then
    echo -e "${RED}✗ 容器不健康${NC}"
    echo "  最近的健康检查日志:"
    docker inspect vie-gallery-api --format='{{range .State.Health.Log}}{{.Output}}{{end}}' 2>/dev/null | tail -n 5
else
    echo -e "${YELLOW}⚠ 健康状态: $HEALTH${NC}"
fi

echo -e "\n${YELLOW}[3/8] 检查 Spring Boot 应用启动状态...${NC}"
APP_LOG=$(docker logs vie-gallery-api 2>&1 | tail -n 50)
if echo "$APP_LOG" | grep -q "Started GalleryApiApplication"; then
    echo -e "${GREEN}✓ Spring Boot 应用已启动${NC}"
    STARTUP_TIME=$(echo "$APP_LOG" | grep "Started GalleryApiApplication" | grep -oP 'in \K[\d.]+' || echo "未知")
    echo "  启动时间: ${STARTUP_TIME} 秒"
elif echo "$APP_LOG" | grep -q "APPLICATION FAILED TO START"; then
    echo -e "${RED}✗ 应用启动失败${NC}"
    echo "  错误详情:"
    echo "$APP_LOG" | grep -A 10 "APPLICATION FAILED TO START"
else
    echo -e "${YELLOW}⚠ 应用可能仍在启动中${NC}"
fi

echo -e "\n${YELLOW}[4/8] 检查关键错误...${NC}"
ERRORS=$(docker logs vie-gallery-api 2>&1 | grep -iE "error|exception|failed" | tail -n 10)
if [ -z "$ERRORS" ]; then
    echo -e "${GREEN}✓ 日志中未发现明显错误${NC}"
else
    echo -e "${RED}✗ 发现以下错误:${NC}"
    echo "$ERRORS" | while IFS= read -r line; do
        echo "  $line"
    done
fi

echo -e "\n${YELLOW}[5/8] 检查 Flyway 迁移历史...${NC}"
FLYWAY_CHECK=$(docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e "SELECT installed_rank, version, description, success, installed_on FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5;" \
  2>&1 || echo "FAILED")

if echo "$FLYWAY_CHECK" | grep -q "FAILED"; then
    echo -e "${RED}✗ 无法查询 Flyway 历史${NC}"
    echo "  可能原因: 数据库连接失败或表不存在"
else
    echo -e "${GREEN}✓ Flyway 迁移历史:${NC}"
    echo "$FLYWAY_CHECK"
    
    # 检查 V15 迁移状态
    if echo "$FLYWAY_CHECK" | grep -q "15.*add raw token"; then
        if echo "$FLYWAY_CHECK" | grep "15.*add raw token" | grep -q "1"; then
            echo -e "${GREEN}  ✓ V15 迁移已成功执行${NC}"
        else
            echo -e "${RED}  ✗ V15 迁移执行失败${NC}"
        fi
    else
        echo -e "${YELLOW}  ⚠ V15 迁移尚未执行${NC}"
    fi
fi

echo -e "\n${YELLOW}[6/8] 检查 share_link 表结构...${NC}"
TABLE_STRUCT=$(docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e "DESCRIBE share_link;" 2>&1 || echo "FAILED")

if echo "$TABLE_STRUCT" | grep -q "FAILED"; then
    echo -e "${RED}✗ 无法查询 share_link 表${NC}"
    echo "  可能原因: 表不存在或数据库连接失败"
else
    if echo "$TABLE_STRUCT" | grep -q "raw_token"; then
        echo -e "${GREEN}✓ raw_token 列已存在${NC}"
        echo "$TABLE_STRUCT" | grep "raw_token"
    else
        echo -e "${RED}✗ raw_token 列不存在${NC}"
        echo "  需要手动执行迁移或重启容器"
    fi
    
    if echo "$TABLE_STRUCT" | grep -q "short_code"; then
        echo -e "${GREEN}✓ short_code 列已存在${NC}"
    else
        echo -e "${RED}✗ short_code 列不存在 (V14 迁移可能未执行)${NC}"
    fi
fi

echo -e "\n${YELLOW}[7/8] 测试健康检查端点...${NC}"
HEALTH_RESPONSE=$(docker exec vie-gallery-api wget -qO- http://localhost:8080/actuator/health 2>&1 || echo "FAILED")

if [ "$HEALTH_RESPONSE" = "FAILED" ]; then
    echo -e "${RED}✗ 健康检查端点无响应${NC}"
    echo "  应用可能未完全启动或端口未监听"
elif echo "$HEALTH_RESPONSE" | grep -q '"status":"UP"'; then
    echo -e "${GREEN}✓ 健康检查端点返回 UP${NC}"
    echo "  响应: $HEALTH_RESPONSE"
else
    echo -e "${YELLOW}⚠ 健康检查端点返回非 UP 状态${NC}"
    echo "  响应: $HEALTH_RESPONSE"
fi

echo -e "\n${YELLOW}[8/8] 检查关键环境变量...${NC}"
ENV_CHECK=$(docker exec vie-gallery-api env | grep -E "SPRING_PROFILES_ACTIVE|DB_URL|REDIS_URL" || echo "")
if [ -n "$ENV_CHECK" ]; then
    echo -e "${GREEN}✓ 关键环境变量已设置:${NC}"
    echo "$ENV_CHECK" | while IFS= read -r line; do
        echo "  $line"
    done
else
    echo -e "${RED}✗ 未找到关键环境变量${NC}"
fi

echo -e "\n${BLUE}=== 诊断摘要 ===${NC}\n"

# 生成诊断摘要
SUMMARY=""
if [ "$HEALTH" = "unhealthy" ]; then
    SUMMARY="${SUMMARY}• 容器状态: ${RED}不健康${NC}\n"
fi

if echo "$APP_LOG" | grep -q "Started GalleryApiApplication"; then
    SUMMARY="${SUMMARY}• Spring Boot: ${GREEN}已启动${NC}\n"
else
    SUMMARY="${SUMMARY}• Spring Boot: ${RED}未启动${NC}\n"
fi

if echo "$FLYWAY_CHECK" | grep "15.*add raw token" | grep -q "1"; then
    SUMMARY="${SUMMARY}• V15 迁移: ${GREEN}成功${NC}\n"
elif echo "$FLYWAY_CHECK" | grep -q "15.*add raw token"; then
    SUMMARY="${SUMMARY}• V15 迁移: ${RED}失败${NC}\n"
else
    SUMMARY="${SUMMARY}• V15 迁移: ${YELLOW}未执行${NC}\n"
fi

if echo "$TABLE_STRUCT" | grep -q "raw_token"; then
    SUMMARY="${SUMMARY}• raw_token 列: ${GREEN}存在${NC}\n"
else
    SUMMARY="${SUMMARY}• raw_token 列: ${RED}缺失${NC}\n"
fi

if [ "$HEALTH_RESPONSE" != "FAILED" ] && echo "$HEALTH_RESPONSE" | grep -q '"status":"UP"'; then
    SUMMARY="${SUMMARY}• 健康检查: ${GREEN}通过${NC}\n"
else
    SUMMARY="${SUMMARY}• 健康检查: ${RED}失败${NC}\n"
fi

echo -e "$SUMMARY"

echo -e "\n${BLUE}=== 建议的下一步 ===${NC}\n"

# 根据诊断结果提供建议
if [ "$HEALTH" = "unhealthy" ]; then
    echo "1. 查看完整日志: docker logs vie-gallery-api --tail=200"
    
    if echo "$TABLE_STRUCT" | grep -q "raw_token"; then
        echo "2. raw_token 列已存在，但应用不健康 - 检查应用启动日志"
    else
        echo "2. raw_token 列缺失 - 运行修复脚本: ./fix-raw-token-migration.sh"
    fi
    
    if ! echo "$APP_LOG" | grep -q "Started GalleryApiApplication"; then
        echo "3. 应用未完全启动 - 等待更长时间或检查启动错误"
    fi
else
    echo -e "${GREEN}✓ 系统状态正常${NC}"
fi

echo -e "\n${BLUE}完整日志保存位置:${NC}"
echo "  运行以下命令保存完整日志:"
echo "  docker logs vie-gallery-api > /tmp/api-debug.log 2>&1"
