#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PORT="${API_PORT:-8088}"

echo "🚀 Starting VIE Gallery services..."

# Navigate to infra directory
cd "$SCRIPT_DIR/infra"

# Start all services
echo "📦 Starting Docker services (MySQL, Redis, MinIO, API)..."
API_PORT="$API_PORT" docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
docker-compose ps

echo ""
echo "✅ Backend services started!"
echo ""
echo "📊 Service URLs:"
echo "  - API:          http://localhost:${API_PORT}"
echo "  - MySQL:        localhost:3307 (container: 3306)"
echo "  - Redis:        localhost:6379"
echo "  - MinIO:        http://localhost:9000"
echo "  - MinIO Console: http://localhost:9001"
echo ""
echo "🔍 Check logs with: docker-compose -f infra/docker-compose.yml logs -f"
