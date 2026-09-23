#!/usr/bin/env bash
# API 健康检查完整诊断脚本
# 用法: cd ~/vie-gallery/infra && bash ../scripts/diagnose-api.sh
# 只读诊断：不会重启容器、执行 DDL 或修改 Flyway history。

set -u

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE=".env.production"
API_CONTAINER="vie-gallery-api"
MYSQL_CONTAINER="vie-gallery-mysql"
DB_NAME="vie_gallery"

print_section() {
    printf '\n%s[%s]%s\n' "$YELLOW" "$1" "$NC"
}

# Read a simple KEY=value entry without sourcing the production env file.
env_value() {
    local key="$1"
    if [ -f "$ENV_FILE" ]; then
        sed -n "s/^${key}=//p" "$ENV_FILE" | head -n 1
    fi
}

DB_USER="$(env_value MYSQL_USER)"
DB_USER="${DB_USER:-vie_user}"
DB_PASS="$(env_value MYSQL_PASSWORD)"
DB_PASS="${DB_PASS:-vie_password_2026}"
DB_NAME="$(env_value MYSQL_DATABASE)"
DB_NAME="${DB_NAME:-vie_gallery}"

mysql_query() {
    local query="$1"
    docker exec -e "MYSQL_PWD=$DB_PASS" "$MYSQL_CONTAINER" \
        mysql -u"$DB_USER" "$DB_NAME" -e "$query"
}

if [ ! -f "$COMPOSE_FILE" ]; then
    printf '%s错误: 请在 ~/vie-gallery/infra 目录下运行此脚本%s\n' "$RED" "$NC"
    exit 1
fi

printf '%s=== VIE Gallery API 诊断工具 ===%s\n' "$BLUE" "$NC"
if [ -f "$ENV_FILE" ]; then
    printf '%s✓ 已读取 %s（不会输出其中的密钥）%s\n' "$GREEN" "$ENV_FILE" "$NC"
else
    printf '%s⚠ 未找到 %s，数据库诊断将使用默认连接参数%s\n' "$YELLOW" "$ENV_FILE" "$NC"
fi

print_section "1/8 容器状态"
if docker inspect "$API_CONTAINER" >/dev/null 2>&1; then
    docker inspect "$API_CONTAINER" \
        --format='status={{.State.Status}} running={{.State.Running}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}} error={{.State.Error}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}' \
        || true
else
    printf '%s✗ API 容器不存在%s\n' "$RED" "$NC"
fi
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -a 2>&1 || true

print_section "2/8 容器健康状态"
HEALTH="$(docker inspect "$API_CONTAINER" --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' 2>/dev/null || printf 'container-missing')"
printf '容器健康状态: %s\n' "$HEALTH"
docker inspect "$API_CONTAINER" --format='{{if .State.Health}}{{range .State.Health.Log}}{{printf "start=%s end=%s exit=%d output=%q\n" .Start .End .ExitCode .Output}}{{end}}{{end}}' 2>&1 || true

print_section "3/8 Spring Boot 日志"
APP_LOG="$(docker logs "$API_CONTAINER" --timestamps --tail 200 2>&1)"
if [ -z "$APP_LOG" ]; then
    printf '%s⚠ 没有读取到 API 日志%s\n' "$YELLOW" "$NC"
else
    printf '%s\n' "$APP_LOG"
fi
if printf '%s\n' "$APP_LOG" | grep -q "Started GalleryApiApplication"; then
    printf '%s✓ Spring Boot 已完成启动%s\n' "$GREEN" "$NC"
elif printf '%s\n' "$APP_LOG" | grep -qE "APPLICATION FAILED TO START|FlywayException|Migration.*failed|checksum mismatch|Duplicate column|Duplicate key"; then
    printf '%s✗ 日志包含启动或迁移失败信号%s\n' "$RED" "$NC"
else
    printf '%s⚠ 未发现完成启动标志%s\n' "$YELLOW" "$NC"
fi

print_section "4/8 关键错误摘要"
ERRORS="$(printf '%s\n' "$APP_LOG" | grep -iE "error|exception|failed|flyway|migration|redis|mysql|oss|storage|accessdenied|nosuchbucket" | tail -n 40 || true)"
if [ -z "$ERRORS" ]; then
    printf '%s✓ 未发现匹配的错误关键词%s\n' "$GREEN" "$NC"
else
    printf '%s\n' "$ERRORS"
fi

print_section "5/8 Flyway 迁移历史（只读）"
FLYWAY_CHECK="$(mysql_query "SELECT installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 15;" 2>&1)"
FLYWAY_EXIT=$?
printf '%s\n' "$FLYWAY_CHECK"
if [ "$FLYWAY_EXIT" -ne 0 ]; then
    printf '%s✗ 无法查询 Flyway history%s\n' "$RED" "$NC"
else
    mysql_query "SELECT version, COUNT(*) AS count FROM flyway_schema_history GROUP BY version HAVING COUNT(*) > 1;" 2>&1 || true
    V14_STATUS="$(mysql_query "SELECT CONCAT('version=', version, ' success=', success, ' checksum=', COALESCE(checksum, 'NULL')) FROM flyway_schema_history WHERE version='14' ORDER BY installed_rank DESC LIMIT 1;" 2>/dev/null || true)"
    V15_STATUS="$(mysql_query "SELECT CONCAT('version=', version, ' success=', success, ' checksum=', COALESCE(checksum, 'NULL')) FROM flyway_schema_history WHERE version='15' ORDER BY installed_rank DESC LIMIT 1;" 2>/dev/null || true)"
    printf 'V14: %s\n' "${V14_STATUS:-未记录}"
    printf 'V15: %s\n' "${V15_STATUS:-未记录}"
fi

print_section "6/8 share_link 表结构和索引（只读）"
mysql_query "SELECT ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='share_link' AND COLUMN_NAME IN ('short_code', 'raw_token') ORDER BY ORDINAL_POSITION;" 2>&1 || true
mysql_query "SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='share_link' AND INDEX_NAME IN ('uk_share_link_short_code', 'idx_share_link_raw_token') ORDER BY INDEX_NAME, SEQ_IN_INDEX;" 2>&1 || true

print_section "7/8 健康检查端点"
HEALTH_RESPONSE="$(docker exec "$API_CONTAINER" sh -c 'wget -S -O - http://127.0.0.1:8080/actuator/health' 2>&1)"
HEALTH_EXIT=$?
printf '%s\n' "$HEALTH_RESPONSE"
printf 'health 命令退出码: %s\n' "$HEALTH_EXIT"
if [ "$HEALTH_EXIT" -ne 0 ]; then
    printf '%s✗ 容器内健康检查命令失败（可能是应用未监听或 wget 不可用）%s\n' "$RED" "$NC"
elif printf '%s\n' "$HEALTH_RESPONSE" | grep -q '"status"[[:space:]]*:[[:space:]]*"UP"'; then
    printf '%s✓ 健康检查返回 UP%s\n' "$GREEN" "$NC"
elif printf '%s\n' "$HEALTH_RESPONSE" | grep -q '"status"[[:space:]]*:[[:space:]]*"DOWN"'; then
    printf '%s✗ 健康检查返回 DOWN，请结合日志中的 database/redis/objectStorage 原因判断%s\n' "$RED" "$NC"
else
    printf '%s⚠ 健康检查返回了非 UP/ DOWN 的响应%s\n' "$YELLOW" "$NC"
fi

print_section "8/8 关键环境变量（仅名称和长度）"
docker exec "$API_CONTAINER" sh -c '
for v in SPRING_PROFILES_ACTIVE DB_URL DB_USERNAME DB_PASSWORD REDIS_URL \
         STORAGE_ENDPOINT STORAGE_ACCESS_KEY STORAGE_SECRET_KEY STORAGE_BUCKET \
         ALIYUN_OSS_ENDPOINT ALIYUN_OSS_ACCESS_KEY_ID ALIYUN_OSS_ACCESS_KEY_SECRET \
         ALIYUN_OSS_BUCKET GALLERY_SECURITY_ENCRYPTION_SECRET \
         GALLERY_SECURITY_ENCRYPTION_SALT GALLERY_SECURITY_JWT_SECRET; do
    val=$(printenv "$v" || true)
    if [ -n "$val" ]; then
        printf "%s=set(length=%s)\n" "$v" "${#val}"
    else
        printf "%s=missing-or-empty\n" "$v"
    fi
done
' 2>&1 || true

printf '\n%s=== 诊断摘要 ===%s\n' "$BLUE" "$NC"
printf '容器健康: %s\n' "$HEALTH"
if printf '%s\n' "$APP_LOG" | grep -q "Started GalleryApiApplication"; then
    printf 'Spring Boot: 已启动\n'
else
    printf 'Spring Boot: 未确认完成启动\n'
fi
if [ "$HEALTH_EXIT" -eq 0 ] && printf '%s\n' "$HEALTH_RESPONSE" | grep -q '"status"[[:space:]]*:[[:space:]]*"UP"'; then
    printf '健康端点: UP\n'
else
    printf '健康端点: 未通过\n'
fi

printf '\n%s=== 安全说明 ===%s\n' "$BLUE" "$NC"
printf '本脚本只读查询。不要在未保存备份和核对 Flyway history/schema 前运行手工迁移修复脚本。\n'
printf '完整日志可保存为: docker logs %s > /tmp/api-debug.log 2>&1\n' "$API_CONTAINER"
