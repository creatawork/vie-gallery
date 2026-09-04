#!/bin/bash
set -e

echo "🚀 Starting VIE Gallery services..."

# Navigate to infra directory
cd "$(dirname "$0")/infra"

# Start all services
echo "📦 Starting Docker services (MySQL, Redis, MinIO, API)..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
docker-compose ps

echo ""
echo "✅ Backend services started!"
echo ""
echo "📊 Service URLs:"
echo "  - API:          http://localhost:8080"
echo "  - MySQL:        localhost:3306"
echo "  - Redis:        localhost:6379"
echo "  - MinIO:        http://localhost:9000"
echo "  - MinIO Console: http://localhost:9001"
echo ""
echo "🔍 Check logs with: docker-compose -f infra/docker-compose.yml logs -f"
