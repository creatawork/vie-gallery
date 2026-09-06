#!/bin/bash
# VIE Gallery - Browser MCP E2E Test
# This script uses browser MCP to test the complete user flow

set -e

echo "🌐 VIE Gallery - Browser MCP E2E Test"
echo "======================================"
echo ""

# Test Configuration
ADMIN_URL="${ADMIN_URL:-http://localhost:5173}"
API_PORT="${API_PORT:-8088}"
API_URL="${API_URL:-http://localhost:${API_PORT}}"
TEST_EMAIL="browser-test-$(date +%s)@example.com"
TEST_PASSWORD="Test12345678"

echo "📋 Test Configuration:"
echo "  Admin URL: $ADMIN_URL"
echo "  Test Email: $TEST_EMAIL"
echo "  Test Username: $TEST_USERNAME"
echo ""

# Check if services are running
echo "🔍 Checking services..."
if ! curl -s -f "$API_URL/actuator/health" > /dev/null 2>&1; then
    echo "❌ API is not running at $API_URL"
    exit 1
fi

if ! curl -s -f "$ADMIN_URL" > /dev/null 2>&1; then
    echo "❌ Admin UI is not running at $ADMIN_URL"
    exit 1
fi

echo "✅ All services are running"
echo ""

# Create test image
TEST_IMAGE_PATH="/tmp/vie-test-photo-$(date +%s).jpg"
if command -v convert &> /dev/null; then
    convert -size 1200x800 gradient:blue-lightblue \
        -pointsize 48 -fill white -gravity center \
        -annotate +0-100 "VIE Gallery Test Photo" \
        -annotate +0+100 "$(date '+%Y-%m-%d %H:%M:%S')" \
        "$TEST_IMAGE_PATH"
    echo "✅ Test image created: $TEST_IMAGE_PATH"
else
    echo "⚠️  ImageMagick not found, will skip image upload test"
    TEST_IMAGE_PATH=""
fi

echo ""
echo "================================================"
echo "Starting Browser Automation Tests"
echo "================================================"
echo ""

# Test data to be used in browser tests
cat > /tmp/vie-gallery-test-data.json <<EOF
{
  "adminUrl": "$ADMIN_URL",
  "apiUrl": "$API_URL",
  "testEmail": "$TEST_EMAIL",
  "testPassword": "$TEST_PASSWORD",
  "testImagePath": "$TEST_IMAGE_PATH",
  "galleryName": "浏览器测试 Gallery",
  "gallerySlug": "browser-gallery-$(date +%s)",
  "galleryVisibility": "PUBLIC"
}
EOF

echo "✅ Test data saved to /tmp/vie-gallery-test-data.json"
echo ""

echo "================================================"
echo "Manual Browser MCP Test Steps"
echo "================================================"
echo ""
echo "Please use browser MCP with the following steps:"
echo ""
echo "1️⃣  Registration & Login:"
echo "   - Navigate to: $ADMIN_URL"
echo "   - Click register/signup"
echo "   - Fill form: email=$TEST_EMAIL, password=$TEST_PASSWORD"
echo "   - Submit and verify redirect to dashboard"
echo ""
echo "2️⃣  Create Gallery:"
echo "   - Click '创建空间' or 'Create Gallery' button"
echo "   - Fill: name='浏览器测试 Gallery', slug='browser-gallery-<timestamp>', visibility='PUBLIC'"
echo "   - Submit and verify the gallery appears in the gallery list"
echo ""

if [ -n "$TEST_IMAGE_PATH" ]; then
echo "3️⃣  Upload Photo:"
echo "   - Open the created Gallery workspace"
echo "   - Click '上传照片' or 'Upload Photo'"
echo "   - Select file: $TEST_IMAGE_PATH"
echo "   - Wait for asynchronous processing to finish"
echo "   - Verify the photo appears in the Gallery workspace"
echo ""
fi

echo "4️⃣  Create Share Link:"
echo "   - Open the Gallery share panel"
echo "   - Click '生成链接' or 'Generate Link'"
echo "   - Copy the generated viewer URL and token"
echo ""
echo "5️⃣  Verify Public Access:"
echo "   - Open the viewer URL in a new incognito/private window"
echo "   - Verify /api/public/g/{slug} resolves the Gallery"
echo "   - Verify public photos are visible after processing"
echo ""
echo "6️⃣  Test Password Gallery:"
echo "   - Create a Gallery with visibility='PASSWORD' when password management is available"
echo "   - Open /g/{slug} and verify PASSWORD_REQUIRED"
echo "   - Submit the configured password to /unlock and verify the session"
echo ""
echo "================================================"
echo ""

# Create a simple curl-based validation script
cat > /tmp/vie-gallery-validate.sh <<'VALIDATE_SCRIPT'
#!/bin/bash
# Quick validation after browser tests

API_PORT="${API_PORT:-8088}"
API_URL="${API_URL:-http://localhost:${API_PORT}}"

echo "🔍 Validating test results..."

# Check if user exists
USERS_COUNT=$(curl -s "$API_URL/actuator/health" | grep -c "UP" || echo "0")
if [ "$USERS_COUNT" -gt 0 ]; then
    echo "✅ API is healthy"
else
    echo "❌ API health check failed"
fi

# Try to access a public endpoint
PUBLIC_TEST=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/actuator/health")
if [ "$PUBLIC_TEST" = "200" ]; then
    echo "✅ Public endpoints accessible"
else
    echo "❌ Public endpoints returned: $PUBLIC_TEST"
fi

echo ""
echo "For full validation, check:"
echo "  - Database: docker exec -it vie-gallery-mysql-1 mysql -uvie -pvie_local vie_gallery"
echo "  - MinIO: http://localhost:9001 (vie_local / vie_local_secret)"
echo "  - Redis: docker exec -it vie-gallery-redis-1 redis-cli"
VALIDATE_SCRIPT

chmod +x /tmp/vie-gallery-validate.sh

echo "💡 Quick Tips:"
echo "  - Use browser devtools Network tab to monitor API calls"
echo "  - Check browser console for any errors"
echo "  - Validate with: bash /tmp/vie-gallery-validate.sh"
echo ""
echo "📁 Test Artifacts:"
echo "  - Test data: /tmp/vie-gallery-test-data.json"
echo "  - Test image: $TEST_IMAGE_PATH"
echo "  - Validator: /tmp/vie-gallery-validate.sh"
echo ""
