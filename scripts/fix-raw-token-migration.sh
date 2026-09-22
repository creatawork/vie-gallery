#!/bin/bash
# API raw_token 迁移修复脚本
# 用法: ssh 到服务器后运行 ./fix-raw-token-migration.sh
# 此脚本处理 V15 迁移失败的常见场景

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== VIE Gallery API - raw_token 迁移修复工具 ===${NC}\n"

# 检查是否在正确的目录
if [ ! -f "docker-compose.production.yml" ]; then
    echo -e "${RED}错误: 请在 ~/vie-gallery/infra 目录下运行此脚本${NC}"
    exit 1
fi

DB_USER="vie_user"
DB_PASS="vie_password_2026"
DB_NAME="vie_gallery"

echo -e "${YELLOW}步骤 1/5: 检查 raw_token 列是否存在...${NC}"
COLUMN_EXISTS=$(docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} \
  -sN -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_NAME='share_link' AND COLUMN_NAME='raw_token';" 2>&1)

if [ "$COLUMN_EXISTS" = "1" ]; then
    echo -e "${GREEN}✓ raw_token 列已存在${NC}"
    COLUMN_PRESENT=true
elif [ "$COLUMN_EXISTS" = "0" ]; then
    echo -e "${YELLOW}⚠ raw_token 列不存在，需要添加${NC}"
    COLUMN_PRESENT=false
else
    echo -e "${RED}✗ 无法检查列状态: $COLUMN_EXISTS${NC}"
    exit 1
fi

echo -e "\n${YELLOW}步骤 2/5: 检查 V15 迁移记录...${NC}"
V15_EXISTS=$(docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} \
  -sN -e "SELECT COUNT(*) FROM flyway_schema_history WHERE version='15';" 2>&1)

if [ "$V15_EXISTS" = "1" ]; then
    V15_SUCCESS=$(docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} \
      -sN -e "SELECT success FROM flyway_schema_history WHERE version='15';" 2>&1)
    
    if [ "$V15_SUCCESS" = "1" ]; then
        echo -e "${GREEN}✓ V15 迁移已标记为成功${NC}"
        V15_RECORDED=true
    else
        echo -e "${RED}✗ V15 迁移已记录但标记为失败${NC}"
        V15_RECORDED=false
    fi
else
    echo -e "${YELLOW}⚠ V15 迁移未记录${NC}"
    V15_RECORDED=false
fi

echo -e "\n${YELLOW}步骤 3/5: 确定修复方案...${NC}"

# 场景判断
if [ "$COLUMN_PRESENT" = true ] && [ "$V15_RECORDED" = true ]; then
    echo -e "${GREEN}✓ 数据库状态正常，无需修复${NC}"
    echo "  问题可能在其他地方，请运行诊断脚本: ./diagnose-api.sh"
    exit 0
elif [ "$COLUMN_PRESENT" = true ] && [ "$V15_RECORDED" = false ]; then
    echo -e "${BLUE}场景 A: 列已存在但 Flyway 未记录${NC}"
    echo "  将手动添加 V15 迁移记录"
    FIX_SCENARIO="A"
elif [ "$COLUMN_PRESENT" = false ] && [ "$V15_RECORDED" = false ]; then
    echo -e "${BLUE}场景 B: 列不存在且 Flyway 未记录${NC}"
    echo "  将执行迁移 SQL 并记录到 Flyway"
    FIX_SCENARIO="B"
elif [ "$COLUMN_PRESENT" = false ] && [ "$V15_RECORDED" = true ]; then
    echo -e "${BLUE}场景 C: Flyway 已记录但列不存在（异常状态）${NC}"
    echo "  将删除错误的 Flyway 记录并重新执行迁移"
    FIX_SCENARIO="C"
else
    echo -e "${RED}✗ 未知场景，无法自动修复${NC}"
    exit 1
fi

echo -e "\n${YELLOW}步骤 4/5: 执行修复...${NC}"

case $FIX_SCENARIO in
    A)
        echo "正在添加 V15 Flyway 记录..."
        NEXT_RANK=$(docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} \
          -sN -e "SELECT MAX(installed_rank)+1 FROM flyway_schema_history;")
        
        docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} <<EOF
INSERT INTO flyway_schema_history 
  (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success) 
VALUES 
  (${NEXT_RANK}, '15', 'add raw token to share link', 'SQL', 'V15__add_raw_token_to_share_link.sql', NULL, 'manual_fix', 0, 1);
EOF
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Flyway 记录已添加${NC}"
        else
            echo -e "${RED}✗ 添加 Flyway 记录失败${NC}"
            exit 1
        fi
        ;;
        
    B)
        echo "正在执行迁移 SQL..."
        docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} <<EOF
ALTER TABLE share_link ADD COLUMN raw_token VARCHAR(255) NULL AFTER short_code;
EOF
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ raw_token 列已添加${NC}"
            
            echo "正在添加 V15 Flyway 记录..."
            NEXT_RANK=$(docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} \
              -sN -e "SELECT MAX(installed_rank)+1 FROM flyway_schema_history;")
            
            docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} <<EOF2
INSERT INTO flyway_schema_history 
  (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success) 
VALUES 
  (${NEXT_RANK}, '15', 'add raw token to share link', 'SQL', 'V15__add_raw_token_to_share_link.sql', NULL, 'manual_fix', 0, 1);
EOF2
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓ Flyway 记录已添加${NC}"
            else
                echo -e "${RED}✗ 添加 Flyway 记录失败${NC}"
                exit 1
            fi
        else
            echo -e "${RED}✗ 添加列失败${NC}"
            exit 1
        fi
        ;;
        
    C)
        echo "正在删除错误的 V15 记录..."
        docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} <<EOF
DELETE FROM flyway_schema_history WHERE version='15';
EOF
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ 错误记录已删除${NC}"
            
            echo "正在执行迁移 SQL..."
            docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} <<EOF2
ALTER TABLE share_link ADD COLUMN raw_token VARCHAR(255) NULL AFTER short_code;
EOF2
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓ raw_token 列已添加${NC}"
                
                echo "正在添加新的 V15 Flyway 记录..."
                NEXT_RANK=$(docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} \
                  -sN -e "SELECT MAX(installed_rank)+1 FROM flyway_schema_history;")
                
                docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} <<EOF3
INSERT INTO flyway_schema_history 
  (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success) 
VALUES 
  (${NEXT_RANK}, '15', 'add raw token to share link', 'SQL', 'V15__add_raw_token_to_share_link.sql', NULL, 'manual_fix', 0, 1);
EOF3
                
                if [ $? -eq 0 ]; then
                    echo -e "${GREEN}✓ Flyway 记录已添加${NC}"
                else
                    echo -e "${RED}✗ 添加 Flyway 记录失败${NC}"
                    exit 1
                fi
            else
                echo -e "${RED}✗ 添加列失败${NC}"
                exit 1
            fi
        else
            echo -e "${RED}✗ 删除错误记录失败${NC}"
            exit 1
        fi
        ;;
esac

echo -e "\n${YELLOW}步骤 5/5: 重启 API 容器...${NC}"
docker restart vie-gallery-api

echo -e "${BLUE}等待容器启动（30 秒）...${NC}"
sleep 30

# 检查容器健康状态
HEALTH=$(docker inspect vie-gallery-api --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
echo "容器健康状态: $HEALTH"

if [ "$HEALTH" = "healthy" ]; then
    echo -e "\n${GREEN}✓✓✓ 修复成功！API 容器现在是健康的 ✓✓✓${NC}"
elif [ "$HEALTH" = "starting" ]; then
    echo -e "\n${YELLOW}⚠ 容器正在启动，请等待并运行诊断脚本确认${NC}"
    echo "  ./diagnose-api.sh"
else
    echo -e "\n${RED}✗ 容器仍不健康，需要进一步诊断${NC}"
    echo "  运行诊断脚本: ./diagnose-api.sh"
    echo "  查看日志: docker logs vie-gallery-api --tail=100"
fi

echo -e "\n${BLUE}=== 修复完成 ===${NC}"
echo "验证命令:"
echo "  docker exec vie-gallery-mysql mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} -e 'DESCRIBE share_link;'"
echo "  docker exec vie-gallery-api wget -qO- http://localhost:8080/actuator/health"
