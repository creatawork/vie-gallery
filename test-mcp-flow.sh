#!/bin/bash
# VIE Gallery - current Gallery API smoke test
# This script exercises the smallest useful authenticated and public flow.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PORT="${API_PORT:-8088}"
API_BASE="${API_BASE:-http://localhost:${API_PORT}}"
TEST_EMAIL="gallery-test-$(date +%s)@example.com"
TEST_PASSWORD="Test12345678"
TEST_DISPLAY_NAME="Gallery API Test"
COOKIE_FILE="${TMPDIR:-/tmp}/vie-gallery-session-$$.txt"
PUBLIC_COOKIE_FILE="${TMPDIR:-/tmp}/vie-gallery-public-$$.txt"
RESPONSE_FILE="${TMPDIR:-/tmp}/vie-gallery-response-$$.json"
PUBLIC_RESPONSE_FILE="${TMPDIR:-/tmp}/vie-gallery-public-response-$$.json"
CSRF_TOKEN=""
PUBLIC_CSRF_TOKEN=""
RESPONSE_STATUS=""
RESPONSE_BODY=""
PYTHON_BIN=""
for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 && [[ "$("$candidate" -c 'print(1)' 2>/dev/null)" == "1" ]]; then
        PYTHON_BIN="$(command -v "$candidate")"
        break
    fi
done
NODE_BIN="$(command -v node || true)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
    rm -f "$COOKIE_FILE" "$PUBLIC_COOKIE_FILE" "$RESPONSE_FILE" "$PUBLIC_RESPONSE_FILE"
}
trap cleanup EXIT

fail() {
    printf '%bFAILED%b %s\n' "$RED" "$NC" "$1" >&2
    if [[ -n "$RESPONSE_BODY" ]]; then
        printf 'Response: %s\n' "$RESPONSE_BODY" >&2
    fi
    exit 1
}

pass() {
    printf '%b[OK]%b %s\n' "$GREEN" "$NC" "$1"
}

json_value() {
    local path="$1"
    if [[ -n "$PYTHON_BIN" ]]; then
        "$PYTHON_BIN" -c '
import json, sys
try:
    value = json.load(sys.stdin)
    for part in sys.argv[1].split("."):
        value = value[int(part)] if isinstance(value, list) else value[part]
    if value is not None:
        print(value)
except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError):
    pass
' "$path" <<< "$RESPONSE_BODY"
        return 0
    fi

    if [[ -n "$NODE_BIN" ]]; then
        "$NODE_BIN" -e '
const path = process.argv[1].split(".");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  try {
    let value = JSON.parse(input);
    for (const part of path) value = Array.isArray(value) ? value[Number(part)] : value[part];
    if (value !== undefined && value !== null) process.stdout.write(String(value));
  } catch (_) {}
});
' "$path" <<< "$RESPONSE_BODY"
        return 0
    fi

    # Fallback for environments without a JSON runtime; current smoke-test fields are strings.
    local field="${path##*.}"
    printf '%s\n' "$RESPONSE_BODY" | grep -o '"'"'"$field"'"'[[:space:]]*:[[:space:]]*"[^"]*"' |
        while IFS= read -r match; do
            printf '%s\n' "${match#*:}" | tr -d '" ';
            break
        done
}

request() {
    local method="$1"
    local endpoint="$2"
    local body="${3:-}"
    local cookie_file="${4:-$COOKIE_FILE}"
    local csrf_token="${5:-$CSRF_TOKEN}"
    local curl_args=(-sS --connect-timeout 5 --max-time 30 -X "$method" -b "$cookie_file" -c "$cookie_file")

    if [[ "$method" != "GET" && "$method" != "HEAD" && "$method" != "OPTIONS" ]]; then
        curl_args+=(-H 'Content-Type: application/json')
        [[ -n "$csrf_token" ]] && curl_args+=(-H "X-XSRF-TOKEN: $csrf_token")
    fi
    if [[ -n "$body" ]]; then
        curl_args+=(--data "$body")
    fi
    if ! RESPONSE_STATUS="$(curl "${curl_args[@]}" -o "$RESPONSE_FILE" -w '%{http_code}' "$API_BASE$endpoint")"; then
        fail "Request could not reach $API_BASE$endpoint"
    fi
    RESPONSE_BODY="$(<"$RESPONSE_FILE")"
}

request_upload() {
    local endpoint="$1"
    local image_path="$2"
    local cookie_file="${3:-$COOKIE_FILE}"
    local csrf_token="${4:-$CSRF_TOKEN}"
    local curl_args=(-sS --connect-timeout 5 --max-time 60 -X POST -b "$cookie_file" -c "$cookie_file")
    [[ -n "$csrf_token" ]] && curl_args+=(-H "X-XSRF-TOKEN: $csrf_token")
    curl_args+=(-F "files=@$image_path")
    if ! RESPONSE_STATUS="$(curl "${curl_args[@]}" -o "$RESPONSE_FILE" -w '%{http_code}' "$API_BASE$endpoint")"; then
        fail "Upload could not reach $API_BASE$endpoint"
    fi
    RESPONSE_BODY="$(<"$RESPONSE_FILE")"
}

expect_status() {
    local expected="$1"
    local message="$2"
    [[ "$RESPONSE_STATUS" == "$expected" ]] || fail "$message (HTTP $RESPONSE_STATUS)"
    pass "$message"
}

expect_json() {
    local path="$1"
    local expected="$2"
    local message="$3"
    local actual
    actual="$(json_value "$path")"
    [[ "$actual" == "$expected" ]] || fail "$message (got '$actual', expected '$expected')"
    pass "$message"
}

wait_for_photo_ready() {
    local task_id="$1"
    for attempt in $(seq 1 40); do
        request GET "/api/photos/tasks/$task_id" "" "$COOKIE_FILE"
        local task_status
        task_status="$(json_value status)"
        case "$task_status" in
            SUCCEEDED)
                pass "Photo processing completed"
                return 0
                ;;
            FAILED)
                fail "Photo processing failed"
                ;;
        esac
        sleep 1
    done
    fail "Photo processing timed out"
}

publish_gallery() {
    local gallery_id="$1"
    request POST "/api/galleries/$gallery_id/publish" "" "$COOKIE_FILE" "$CSRF_TOKEN"
    expect_status 200 "Publish gallery"
    expect_json status PUBLISHED "Gallery is published"
}

upload_and_publish_gallery() {
    local gallery_id="$1"
    local label="$2"
    local image_path="$SCRIPT_DIR/spatial-atmosphere-particles-bloom.png"
    [[ -f "$image_path" ]] || fail "Photo fixture is missing: $image_path"
    request_upload "/api/galleries/$gallery_id/photos" "$image_path" "$COOKIE_FILE" "$CSRF_TOKEN"
    expect_status 202 "Upload a photo to $label gallery"
    local task_id
    task_id="$(json_value items.0.taskId)"
    [[ -n "$task_id" ]] || fail "Upload response did not return a task id"
    wait_for_photo_ready "$task_id"
    publish_gallery "$gallery_id"
}

init_csrf() {
    local cookie_file="$1"
    local response_file="$2"
    if ! RESPONSE_STATUS="$(curl -sS --connect-timeout 5 --max-time 30 -b "$cookie_file" -c "$cookie_file" \
        -o "$response_file" -w '%{http_code}' "$API_BASE/api/auth/csrf")"; then
        fail "CSRF endpoint is unreachable"
    fi
    RESPONSE_BODY="$(<"$response_file")"
    [[ "$RESPONSE_STATUS" == "200" ]] || fail "CSRF initialization failed (HTTP $RESPONSE_STATUS)"
    CSRF_TOKEN="$(json_value token)"
    [[ -n "$CSRF_TOKEN" ]] || fail "CSRF endpoint did not return a token"
}

echo "VIE Gallery - current Gallery API smoke test"
echo "API: $API_BASE"
echo

printf 'Checking API health... '
if ! RESPONSE_STATUS="$(curl -sS --connect-timeout 5 --max-time 10 -o "$RESPONSE_FILE" -w '%{http_code}' "$API_BASE/actuator/health")"; then
    fail "API is not reachable"
fi
RESPONSE_BODY="$(<"$RESPONSE_FILE")"
[[ "$RESPONSE_STATUS" == "200" ]] || fail "API health check failed (HTTP $RESPONSE_STATUS)"
pass "API is healthy"

init_csrf "$COOKIE_FILE" "$RESPONSE_FILE"

REGISTER_DATA="{\"email\":\"$TEST_EMAIL\",\"displayName\":\"$TEST_DISPLAY_NAME\",\"password\":\"$TEST_PASSWORD\"}"
request POST /api/auth/register "$REGISTER_DATA" "$COOKIE_FILE" "$CSRF_TOKEN"
expect_status 201 "Register test user"
expect_json user.email "$TEST_EMAIL" "Registration response contains the user"

# Login is intentionally tested after registration because registration also authenticates.
init_csrf "$COOKIE_FILE" "$RESPONSE_FILE"
LOGIN_DATA="{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}"
request POST /api/auth/login "$LOGIN_DATA" "$COOKIE_FILE" "$CSRF_TOKEN"
expect_status 200 "Login test user"

request GET /api/me "" "$COOKIE_FILE"
expect_status 200 "Read current user from /api/me"
expect_json user.email "$TEST_EMAIL" "Current user matches the test account"

PUBLIC_SLUG="gallery-public-$(date +%s)"
request POST /api/galleries "{\"name\":\"API Public Gallery\",\"slug\":\"$PUBLIC_SLUG\",\"visibility\":\"PUBLIC\"}" "$COOKIE_FILE" "$CSRF_TOKEN"
expect_status 201 "Create PUBLIC gallery"
PUBLIC_GALLERY_ID="$(json_value id)"
[[ -n "$PUBLIC_GALLERY_ID" ]] || fail "Create PUBLIC gallery did not return an id"

request GET /api/galleries "" "$COOKIE_FILE"
expect_status 200 "List galleries"
printf '%s\n' "$RESPONSE_BODY" | grep -Fq "$PUBLIC_GALLERY_ID" || fail "Gallery list does not contain the created gallery"
pass "Gallery list contains the created gallery"

# New galleries start as DRAFT. Upload a READY photo before publishing.
TEST_IMAGE="$SCRIPT_DIR/spatial-atmosphere-particles-bloom.png"
[[ -f "$TEST_IMAGE" ]] || fail "Photo fixture is missing: $TEST_IMAGE"
request_upload "/api/galleries/$PUBLIC_GALLERY_ID/photos" "$TEST_IMAGE" "$COOKIE_FILE" "$CSRF_TOKEN"
expect_status 202 "Upload a photo to PUBLIC gallery"
PHOTO_ID="$(json_value items.0.photoId)"
PHOTO_TASK_ID="$(json_value items.0.taskId)"
[[ -n "$PHOTO_ID" && -n "$PHOTO_TASK_ID" ]] || fail "Upload response did not return photo/task ids"
wait_for_photo_ready "$PHOTO_TASK_ID"
request GET "/api/galleries/$PUBLIC_GALLERY_ID/photos" "" "$COOKIE_FILE"
expect_status 200 "List gallery photos"
printf '%s\n' "$RESPONSE_BODY" | grep -Fq "$PHOTO_ID" || fail "Photo list does not contain the uploaded photo"
pass "Photo list contains the uploaded photo"
publish_gallery "$PUBLIC_GALLERY_ID"

PRIVATE_SLUG="gallery-private-$(date +%s)"
request POST /api/galleries "{\"name\":\"API Private Gallery\",\"slug\":\"$PRIVATE_SLUG\",\"visibility\":\"PRIVATE\"}" "$COOKIE_FILE" "$CSRF_TOKEN"
expect_status 201 "Create PRIVATE gallery"
PRIVATE_GALLERY_ID="$(json_value id)"
[[ -n "$PRIVATE_GALLERY_ID" ]] || fail "Create PRIVATE gallery did not return an id"
upload_and_publish_gallery "$PRIVATE_GALLERY_ID" "PRIVATE"

request POST "/api/galleries/$PRIVATE_GALLERY_ID/share-links" '{}' "$COOKIE_FILE" "$CSRF_TOKEN"
expect_status 201 "Create share link"
SHARE_LINK_ID="$(json_value id)"
SHARE_TOKEN="$(json_value rawToken)"
[[ -n "$SHARE_LINK_ID" && -n "$SHARE_TOKEN" ]] || fail "Share-link response did not return id/rawToken"

request GET "/api/galleries/$PRIVATE_GALLERY_ID/share-links" "" "$COOKIE_FILE"
expect_status 200 "List share links"
printf '%s\n' "$RESPONSE_BODY" | grep -Fq "$SHARE_LINK_ID" || fail "Share-link list does not contain the created link"
pass "Share-link list contains the created link"

request GET "/api/public/g/$PRIVATE_SLUG" "" "$PUBLIC_COOKIE_FILE"
expect_status 200 "Resolve PRIVATE gallery without token"
expect_json accessState SHARE_LINK_REQUIRED "Private gallery requires a share token"

request GET "/api/public/g/$PRIVATE_SLUG" "" "$PUBLIC_COOKIE_FILE"
# The public endpoint accepts the token as a header, matching the viewer client.
if ! RESPONSE_STATUS="$(curl -sS --connect-timeout 5 --max-time 30 -H "X-Share-Token: $SHARE_TOKEN" \
    -b "$PUBLIC_COOKIE_FILE" -c "$PUBLIC_COOKIE_FILE" -o "$RESPONSE_FILE" -w '%{http_code}' \
    "$API_BASE/api/public/g/$PRIVATE_SLUG")"; then
    fail "Tokenized public request failed to reach the API"
fi
RESPONSE_BODY="$(<"$RESPONSE_FILE")"
expect_status 200 "Resolve PRIVATE gallery with share token"
expect_json accessState READY "Valid share token grants public access"

PUBLIC_SLUG_2="gallery-password-$(date +%s)"
request POST /api/galleries "{\"name\":\"API Password Gallery\",\"slug\":\"$PUBLIC_SLUG_2\",\"visibility\":\"PASSWORD\"}" "$COOKIE_FILE" "$CSRF_TOKEN"
expect_status 201 "Create PASSWORD gallery"
PASSWORD_GALLERY_ID="$(json_value id)"
upload_and_publish_gallery "$PASSWORD_GALLERY_ID" "PASSWORD"

request POST "/api/galleries/$PASSWORD_GALLERY_ID/share-links" '{}' "$COOKIE_FILE" "$CSRF_TOKEN"
expect_status 201 "Create PASSWORD gallery share link"
PASSWORD_TOKEN="$(json_value rawToken)"
[[ -n "$PASSWORD_TOKEN" ]] || fail "PASSWORD share-link response did not return rawToken"

request GET "/api/public/g/$PUBLIC_SLUG_2" "" "$PUBLIC_COOKIE_FILE"
expect_status 200 "Resolve PASSWORD gallery"
expect_json accessState PASSWORD_REQUIRED "Password gallery requires unlock"

init_csrf "$PUBLIC_COOKIE_FILE" "$PUBLIC_RESPONSE_FILE"
PUBLIC_CSRF_TOKEN="$CSRF_TOKEN"
if ! RESPONSE_STATUS="$(curl -sS --connect-timeout 5 --max-time 30 -H "X-Share-Token: $PASSWORD_TOKEN" \
    -b "$PUBLIC_COOKIE_FILE" -c "$PUBLIC_COOKIE_FILE" -H "Content-Type: application/json" \
    -H "X-XSRF-TOKEN: $PUBLIC_CSRF_TOKEN" -d '{"password":"Test12345678"}' \
    -o "$RESPONSE_FILE" -w '%{http_code}' "$API_BASE/api/public/g/$PUBLIC_SLUG_2/unlock")"; then
    fail "Password unlock request failed to reach the API"
fi
RESPONSE_BODY="$(<"$RESPONSE_FILE")"
expect_status 403 "Reject unlock when no gallery password is configured"
printf '%b[WARN]%b Successful /unlock is not covered: the current create-gallery API has no password field or password-management endpoint.\n' "$YELLOW" "$NC"

init_csrf "$COOKIE_FILE" "$RESPONSE_FILE"
request POST /api/auth/logout "" "$COOKIE_FILE" "$CSRF_TOKEN"
expect_status 204 "Logout test user"

echo
echo "Smoke test completed."
echo "Created gallery IDs: $PUBLIC_GALLERY_ID, $PRIVATE_GALLERY_ID"
echo "Share token was used only in the request header and was not persisted by the script."
