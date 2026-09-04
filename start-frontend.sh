#!/bin/bash
set -e

echo "🎨 Starting VIE Gallery Frontend services..."

# Start Admin UI
echo "📱 Starting Admin UI (Vue)..."
cd "$(dirname "$0")/apps/gallery-admin"
npm install --silent
npm run dev &
ADMIN_PID=$!
echo "  Admin UI starting on http://localhost:5173 (PID: $ADMIN_PID)"

# Start Viewer UI
echo "🖼️  Starting Viewer UI (Three.js)..."
cd ../gallery-viewer
npm install --silent
npm run dev &
VIEWER_PID=$!
echo "  Viewer UI starting on http://localhost:5174 (PID: $VIEWER_PID)"

echo ""
echo "✅ Frontend services started!"
echo ""
echo "📊 Service URLs:"
echo "  - Admin UI:  http://localhost:5173"
echo "  - Viewer UI: http://localhost:5174"
echo "  - API:       http://localhost:8080"
echo ""
echo "💡 To stop: kill $ADMIN_PID $VIEWER_PID"
echo ""

# Keep script running
wait
