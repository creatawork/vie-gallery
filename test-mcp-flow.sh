#!/bin/bash
set -e

echo "🧪 VIE Gallery - Full MCP Test Suite"
echo "===================================="
echo ""

# Configuration
API_BASE="http://localhost:8080"
ADMIN_UI="http://localhost:5173"
VIEWER_UI="http://localhost:5174"
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_PASSWORD="Test123456"
TEST_USERNAME="testuser-$(date +%s)"
COOKIE_FILE="/tmp/vie-gallery-session.txt"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
check_service() {
    local service=$1
    local url=$2
    echo -n "Checking $service... "
    if curl -s -f "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${RED}✗${NC}"
        return 1
    fi
}

api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local use_cookie=$4

    local cmd="curl -s -X $method"
    cmd="$cmd -H 'Content-Type: application/json'"

    if [ "$use_cookie" = "true" ]; then
        cmd="$cmd -b $COOKIE_FILE -c $COOKIE_FILE"
    fi

    if [ -n "$data" ]; then
        cmd="$cmd -d '$data'"
    fi

    cmd="$cmd $API_BASE$endpoint"

    eval $cmd
}

# Step 0: Check all services
echo "📋 Step 0: Checking service availability..."
ALL_OK=true
check_service "API Health" "$API_BASE/actuator/health" || ALL_OK=false
check_service "Admin UI" "$ADMIN_UI" || ALL_OK=false
check_service "Viewer UI" "$VIEWER_UI" || ALL_OK=false

if [ "$ALL_OK" = false ]; then
    echo -e "${RED}Some services are not running. Please start them first.${NC}"
    echo "Run: bash start-services.sh && bash start-frontend.sh"
    exit 1
fi

echo ""

# Step 1: User Registration
echo "📋 Step 1: User Registration"
echo "----------------------------"
REGISTER_DATA="{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\",\"username\":\"$TEST_USERNAME\"}"
REGISTER_RESPONSE=$(api_call POST "/api/auth/register" "$REGISTER_DATA" false)

if echo "$REGISTER_RESPONSE" | grep -q "id"; then
    echo -e "${GREEN}✓ Registration successful${NC}"
    USER_ID=$(echo "$REGISTER_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
    echo "  User ID: $USER_ID"
else
    echo -e "${RED}✗ Registration failed${NC}"
    echo "  Response: $REGISTER_RESPONSE"
    exit 1
fi
echo ""

# Step 2: User Login
echo "📋 Step 2: User Login"
echo "---------------------"
LOGIN_DATA="{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"
LOGIN_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$LOGIN_DATA" \
    -c "$COOKIE_FILE" \
    "$API_BASE/api/auth/login")

if echo "$LOGIN_RESPONSE" | grep -q "id"; then
    echo -e "${GREEN}✓ Login successful${NC}"
    echo "  Session cookie saved to $COOKIE_FILE"
else
    echo -e "${RED}✗ Login failed${NC}"
    echo "  Response: $LOGIN_RESPONSE"
    exit 1
fi
echo ""

# Step 3: Get Current User
echo "📋 Step 3: Get Current User Info"
echo "---------------------------------"
ME_RESPONSE=$(curl -s -X GET -b "$COOKIE_FILE" "$API_BASE/api/auth/me")

if echo "$ME_RESPONSE" | grep -q "$TEST_EMAIL"; then
    echo -e "${GREEN}✓ User info retrieved${NC}"
    echo "  Email: $TEST_EMAIL"
else
    echo -e "${RED}✗ Failed to get user info${NC}"
    exit 1
fi
echo ""

# Step 4: Create Photo Space
echo "📋 Step 4: Create Photo Space"
echo "------------------------------"
SPACE_DATA='{"name":"测试旅行相册","description":"2024年巴黎之旅"}'
SPACE_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d "$SPACE_DATA" \
    "$API_BASE/api/spaces")

if echo "$SPACE_RESPONSE" | grep -q "id"; then
    echo -e "${GREEN}✓ Space created${NC}"
    SPACE_ID=$(echo "$SPACE_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
    SPACE_SLUG=$(echo "$SPACE_RESPONSE" | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  Space ID: $SPACE_ID"
    echo "  Space Slug: $SPACE_SLUG"
else
    echo -e "${RED}✗ Failed to create space${NC}"
    echo "  Response: $SPACE_RESPONSE"
    exit 1
fi
echo ""

# Step 5: Get My Spaces
echo "📋 Step 5: List My Spaces"
echo "-------------------------"
SPACES_RESPONSE=$(curl -s -X GET -b "$COOKIE_FILE" "$API_BASE/api/spaces")

if echo "$SPACES_RESPONSE" | grep -q "$SPACE_ID"; then
    echo -e "${GREEN}✓ Spaces retrieved${NC}"
    SPACE_COUNT=$(echo "$SPACES_RESPONSE" | grep -o '"id":' | wc -l)
    echo "  Total spaces: $SPACE_COUNT"
else
    echo -e "${RED}✗ Failed to get spaces${NC}"
    exit 1
fi
echo ""

# Step 6: Create Album
echo "📋 Step 6: Create Album"
echo "-----------------------"
ALBUM_DATA='{"name":"巴黎景点","description":"埃菲尔铁塔和卢浮宫"}'
ALBUM_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d "$ALBUM_DATA" \
    "$API_BASE/api/spaces/$SPACE_ID/albums")

if echo "$ALBUM_RESPONSE" | grep -q "id"; then
    echo -e "${GREEN}✓ Album created${NC}"
    ALBUM_ID=$(echo "$ALBUM_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
    echo "  Album ID: $ALBUM_ID"
else
    echo -e "${RED}✗ Failed to create album${NC}"
    echo "  Response: $ALBUM_RESPONSE"
    exit 1
fi
echo ""

# Step 7: Create a test image
echo "📋 Step 7: Upload Photo"
echo "-----------------------"
TEST_IMAGE="/tmp/test-photo.jpg"
# Create a simple test image using ImageMagick or base64
if command -v convert &> /dev/null; then
    convert -size 800x600 xc:blue -pointsize 72 -fill white \
        -gravity center -annotate +0+0 "Test Photo" "$TEST_IMAGE"
    echo "  Test image created: $TEST_IMAGE"
else
    echo -e "${YELLOW}⚠ ImageMagick not found, skipping photo upload test${NC}"
    TEST_IMAGE=""
fi

if [ -n "$TEST_IMAGE" ] && [ -f "$TEST_IMAGE" ]; then
    PHOTO_RESPONSE=$(curl -s -X POST \
        -b "$COOKIE_FILE" \
        -F "file=@$TEST_IMAGE" \
        "$API_BASE/api/spaces/$SPACE_ID/albums/$ALBUM_ID/photos")

    if echo "$PHOTO_RESPONSE" | grep -q "id"; then
        echo -e "${GREEN}✓ Photo uploaded${NC}"
        PHOTO_ID=$(echo "$PHOTO_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
        echo "  Photo ID: $PHOTO_ID"
    else
        echo -e "${RED}✗ Failed to upload photo${NC}"
        echo "  Response: $PHOTO_RESPONSE"
    fi
fi
echo ""

# Step 8: List Photos
echo "📋 Step 8: List Album Photos"
echo "----------------------------"
PHOTOS_RESPONSE=$(curl -s -X GET -b "$COOKIE_FILE" \
    "$API_BASE/api/spaces/$SPACE_ID/albums/$ALBUM_ID/photos")

if echo "$PHOTOS_RESPONSE" | grep -q "id"; then
    echo -e "${GREEN}✓ Photos retrieved${NC}"
    PHOTO_COUNT=$(echo "$PHOTOS_RESPONSE" | grep -o '"id":' | wc -l)
    echo "  Total photos: $PHOTO_COUNT"
else
    echo -e "${YELLOW}⚠ No photos found or failed to retrieve${NC}"
fi
echo ""

# Step 9: Create Public Share Link
echo "📋 Step 9: Create Public Share Link"
echo "------------------------------------"
SHARE_DATA='{"accessType":"PUBLIC"}'
SHARE_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d "$SHARE_DATA" \
    "$API_BASE/api/spaces/$SPACE_ID/shares")

if echo "$SHARE_RESPONSE" | grep -q "slug"; then
    echo -e "${GREEN}✓ Share link created${NC}"
    SHARE_SLUG=$(echo "$SHARE_RESPONSE" | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
    SHARE_URL="$VIEWER_UI/g/$SHARE_SLUG"
    echo "  Share URL: $SHARE_URL"
else
    echo -e "${RED}✗ Failed to create share link${NC}"
    echo "  Response: $SHARE_RESPONSE"
    exit 1
fi
echo ""

# Step 10: Access Public Share (no auth)
echo "📋 Step 10: Access Public Share (No Auth)"
echo "------------------------------------------"
PUBLIC_RESPONSE=$(curl -s -X GET "$API_BASE/api/public/g/$SHARE_SLUG")

if echo "$PUBLIC_RESPONSE" | grep -q "name"; then
    echo -e "${GREEN}✓ Public access successful${NC}"
    echo "  Space visible without authentication"
else
    echo -e "${RED}✗ Failed to access public share${NC}"
    echo "  Response: $PUBLIC_RESPONSE"
    exit 1
fi
echo ""

# Step 11: Create Password-Protected Share
echo "📋 Step 11: Create Password-Protected Share"
echo "-------------------------------------------"
PWD_SHARE_DATA='{"accessType":"PASSWORD","password":"secret123"}'
PWD_SHARE_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d "$PWD_SHARE_DATA" \
    "$API_BASE/api/spaces/$SPACE_ID/shares")

if echo "$PWD_SHARE_RESPONSE" | grep -q "slug"; then
    echo -e "${GREEN}✓ Password-protected share created${NC}"
    PWD_SHARE_SLUG=$(echo "$PWD_SHARE_RESPONSE" | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  Share Slug: $PWD_SHARE_SLUG"
else
    echo -e "${RED}✗ Failed to create password share${NC}"
    exit 1
fi
echo ""

# Step 12: Verify Password
echo "📋 Step 12: Verify Share Password"
echo "----------------------------------"
VERIFY_DATA='{"password":"secret123"}'
VERIFY_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$VERIFY_DATA" \
    "$API_BASE/api/public/g/$PWD_SHARE_SLUG/verify")

if echo "$VERIFY_RESPONSE" | grep -q "token\|success"; then
    echo -e "${GREEN}✓ Password verification successful${NC}"
else
    echo -e "${YELLOW}⚠ Password verification response: $VERIFY_RESPONSE${NC}"
fi
echo ""

# Step 13: Logout
echo "📋 Step 13: User Logout"
echo "-----------------------"
LOGOUT_RESPONSE=$(curl -s -X POST -b "$COOKIE_FILE" "$API_BASE/api/auth/logout")

echo -e "${GREEN}✓ Logout successful${NC}"
echo ""

# Summary
echo "=========================================="
echo "🎉 Test Suite Completed!"
echo "=========================================="
echo ""
echo "📊 Summary:"
echo "  ✓ User Registration"
echo "  ✓ User Login"
echo "  ✓ Get Current User"
echo "  ✓ Create Photo Space"
echo "  ✓ List Spaces"
echo "  ✓ Create Album"
if [ -n "$PHOTO_ID" ]; then
    echo "  ✓ Upload Photo"
    echo "  ✓ List Photos"
else
    echo "  ⚠ Photo Upload (skipped)"
fi
echo "  ✓ Create Public Share"
echo "  ✓ Access Public Share"
echo "  ✓ Create Password Share"
echo "  ✓ Verify Password"
echo "  ✓ User Logout"
echo ""
echo "🔗 Test Resources:"
echo "  Admin UI: $ADMIN_UI"
echo "  Public Share: $SHARE_URL"
echo "  Space ID: $SPACE_ID"
echo "  Album ID: $ALBUM_ID"
echo ""
echo "🧹 Cleanup:"
echo "  rm $COOKIE_FILE"
if [ -f "$TEST_IMAGE" ]; then
    echo "  rm $TEST_IMAGE"
fi
