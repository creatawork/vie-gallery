#!/bin/bash
# 502 错误一键修复脚本
# 当 API 服务因为环境变量丢失导致 502 时运行此脚本

set -e

echo "🔧 开始修复 502 错误..."

cd ~/vie-gallery/infra

echo "📋 检查当前容器状态..."
docker compose -f docker-compose.production.yml ps

echo "🛑 停止 API 容器..."
docker compose -f docker-compose.production.yml down api

echo "🔄 重新创建容器并加载环境变量..."
docker compose -f docker-compose.production.yml --env-file .env.production up -d api

echo "⏳ 等待服务启动 (20秒)..."
sleep 20

echo "📊 检查服务状态..."
docker compose -f docker-compose.production.yml ps

echo "📝 查看最近日志..."
docker logs vie-gallery-api --tail=30 | grep -E "Started|ERROR|Exception" || docker logs vie-gallery-api --tail=50

echo ""
echo "✅ 修复完成!"
echo ""
echo "🧪 测试 API 健康状态:"
curl -s http://localhost:8088/api/auth/csrf | jq . || echo "API 可能还在启动中,请等待几秒后再试"
echo ""
echo "🌐 如果上面显示了 CSRF token,说明 API 已正常运行"
