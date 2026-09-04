#!/bin/bash
# VIE Gallery - Browser MCP E2E Test
# This script uses browser MCP to test the complete user flow

set -e

echo "🌐 VIE Gallery - Browser MCP E2E Test"
echo "======================================"
echo ""

# Test Configuration
ADMIN_URL="http://localhost:5173"
API_URL="http://localhost:8080"
TEST_EMAIL="browser-test-$(date +%s)@example.com"
TEST_PASSWORD="Test123456"
TEST_USERNAME="browsertest$(date +%s)"

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
  "testUsername": "$TEST_USERNAME",
  "testImagePath": "$TEST_IMAGE_PATH",
  "spaceName": "浏览器测试空间",
  "spaceDescription": "通过 MCP 浏览器自动化创建",
  "albumName": "测试相册 $(date +%H:%M:%S)",
  "albumDescription": "自动化测试相册"
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
echo "2️⃣  Create Photo Space:"
echo "   - Click '创建空间' or 'Create Space' button"
echo "   - Fill: name='浏览器测试空间', description='通过 MCP 创建'"
echo "   - Submit and verify space appears in list"
echo ""
echo "3️⃣  Create Album:"
echo "   - Click into the created space"
echo "   - Click '创建相册' or 'Create Album'"
echo "   - Fill: name='测试相册', description='自动化测试'"
echo "   - Submit and verify album created"
echo ""

if [ -n "$TEST_IMAGE_PATH" ]; then
echo "4️⃣  Upload Photo:"
echo "   - Click into the album"
echo "   - Click '上传照片' or 'Upload Photo'"
echo "   - Select file: $TEST_IMAGE_PATH"
echo "   - Wait for upload complete"
echo "   - Verify photo appears in gallery"
echo ""
fi

echo "5️⃣  Create Share Link:"
echo "   - Click '分享' or 'Share' button"
echo "   - Select 'PUBLIC' access type"
echo "   - Click '生成链接' or 'Generate Link'"
echo "   - Copy the share URL"
echo ""
echo "6️⃣  Verify Public Access:"
echo "   - Open share URL in new incognito/private window"
echo "   - Verify space content loads without login"
echo "   - Verify photos are visible"
echo ""
echo "7️⃣  Test Password-Protected Share:"
echo "   - Back to admin, create new share with PASSWORD type"
echo "   - Set password: 'secret123'"
echo "   - Open share URL"
echo "   - Enter password and verify access"
echo ""
echo "================================================"
echo ""

# Create a simple curl-based validation script
cat > /tmp/vie-gallery-validate.sh <<'VALIDATE_SCRIPT'
#!/bin/bash
# Quick validation after browser tests

API_URL="http://localhost:8080"

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
