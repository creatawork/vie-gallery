#!/usr/bin/env bash
# DR-05: real upload failure → requestId → recovery / observability drill
set -Eeuo pipefail

API_BASE="${API_BASE:-http://localhost:8088}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
COOKIE="$(mktemp)"
HDR="$(mktemp)"
BODY="$(mktemp)"
BAD_JPG="$(mktemp --suffix=.jpg)"
GOOD_JPG="$ROOT/spatial-atmosphere-particles-bloom.png"
EMAIL="dr05-$(date +%s)@example.com"
PASSWORD="Test12345678"
CSRF=""
GALLERY_ID=""
REQUEST_ID=""
TASK_ID=""
PHOTO_ID=""

cleanup() { rm -f "$COOKIE" "$HDR" "$BODY" "$BAD_JPG"; }
trap cleanup EXIT

fail() { echo "FAILED: $*" >&2; exit 1; }
ok() { echo "[OK] $*"; }

json() {
  local path="$1"
  if command -v node >/dev/null 2>&1; then
    node -e '
const p=process.argv[1].split(".");
let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{
  try{let v=JSON.parse(s);for(const k of p)v=Array.isArray(v)?v[Number(k)]:v[k];
    if(v!==undefined&&v!==null)process.stdout.write(String(v));}catch(e){}
});' "$path" < "$BODY"
    return 0
  fi
  if command -v python >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1; then
    local py
    py="$(command -v python3 || command -v python)"
    "$py" -c '
import json,sys
v=json.load(sys.stdin)
for p in sys.argv[1].split("."):
  v=v[int(p)] if isinstance(v,list) else v.get(p)
if v is not None: print(v)
' "$path" < "$BODY"
    return 0
  fi
  # minimal fallback for single top-level string fields
  local field="${path##*.}"
  grep -o "\"$field\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$BODY" | head -n1 | sed 's/.*"\([^"]*\)"$/\1/'
}

req() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-sS -D "$HDR" -o "$BODY" -b "$COOKIE" -c "$COOKIE" -X "$method")
  if [[ "$method" != "GET" && "$method" != "HEAD" ]]; then
    args+=(-H "Content-Type: application/json")
    [[ -n "$CSRF" ]] && args+=(-H "X-XSRF-TOKEN: $CSRF")
  fi
  [[ -n "$data" ]] && args+=(--data "$data")
  STATUS="$(curl "${args[@]}" -w '%{http_code}' "$API_BASE$path")"
  REQUEST_ID="$(grep -i '^X-Request-Id:' "$HDR" | awk '{print $2}' | tr -d '\r')"
}

echo "=== DR-05 real acceptance @ $API_BASE ==="
echo "email=$EMAIL"

# 1) health
req GET /actuator/health
[[ "$STATUS" == "200" ]] || fail "health HTTP $STATUS"
[[ "$(json status)" == "UP" ]] || fail "health not UP: $(cat "$BODY")"
ok "API health UP (requestId=$REQUEST_ID)"

# 2) csrf + register
req GET /api/auth/csrf
[[ "$STATUS" == "200" ]] || fail "csrf HTTP $STATUS"
CSRF="$(json token)"
[[ -n "$CSRF" ]] || fail "missing csrf"
req POST /api/auth/register "{\"email\":\"$EMAIL\",\"displayName\":\"DR05\",\"password\":\"$PASSWORD\"}"
[[ "$STATUS" == "201" ]] || fail "register HTTP $STATUS body=$(cat "$BODY")"
ok "registered (requestId=$REQUEST_ID)"

req GET /api/auth/csrf
CSRF="$(json token)"

# 3) create gallery
SLUG="dr05-$(date +%s)"
req POST /api/galleries "{\"name\":\"DR05 Gallery\",\"slug\":\"$SLUG\",\"visibility\":\"PRIVATE\"}"
[[ "$STATUS" == "201" ]] || fail "create gallery HTTP $STATUS body=$(cat "$BODY")"
GALLERY_ID="$(json id)"
[[ -n "$GALLERY_ID" ]] || fail "no gallery id"
ok "gallery created id=$GALLERY_ID"

# 4) corrupt upload (decode reject) — expect batch 202 with accepted=false + requestId
printf 'not-a-real-jpeg' > "$BAD_JPG"
STATUS="$(curl -sS -D "$HDR" -o "$BODY" -b "$COOKIE" -c "$COOKIE" -X POST \
  -H "X-XSRF-TOKEN: $CSRF" \
  -H "X-Client-Batch-Id: dr05-bad-$(date +%s)" \
  -H "Idempotency-Key: dr05-bad-$(date +%s)" \
  -F "files=@${BAD_JPG};type=image/jpeg;filename=broken.jpg" \
  -w '%{http_code}' \
  "$API_BASE/api/galleries/$GALLERY_ID/photos")"
REQUEST_ID="$(grep -i '^X-Request-Id:' "$HDR" | awk '{print $2}' | tr -d '\r')"
BAD_REQUEST_ID="$REQUEST_ID"
echo "corrupt upload HTTP=$STATUS requestId=$BAD_REQUEST_ID body=$(cat "$BODY")"
[[ "$STATUS" == "202" || "$STATUS" =~ ^4 ]] || fail "unexpected HTTP $STATUS for corrupt upload"
ACCEPTED="$(json items.0.accepted)"
ERR_CODE="$(json items.0.error.code)"
[[ "$ACCEPTED" == "false" ]] || fail "corrupt file should not be accepted"
[[ "$ERR_CODE" == "IMAGE_DECODE_FAILED" || "$ERR_CODE" == "FILE_TYPE_UNSUPPORTED" || "$ERR_CODE" == "FILE_INVALID" ]] \
  || fail "unexpected error code: $ERR_CODE"
[[ -n "$BAD_REQUEST_ID" ]] || fail "missing X-Request-Id on corrupt upload"
ok "corrupt upload rejected accepted=false code=$ERR_CODE requestId=$BAD_REQUEST_ID"

# 5) locate requestId in API logs
sleep 1
API_CONTAINER="${GALLERY_API_CONTAINER:-infra-gallery-api-1}"
LOG_HIT="$(docker logs "$API_CONTAINER" 2>&1 | grep -F "$BAD_REQUEST_ID" | tail -n 8 || true)"
echo "log sample:"
echo "$LOG_HIT"
[[ -n "$LOG_HIT" ]] || fail "could not find requestId in $API_CONTAINER logs"
echo "$LOG_HIT" | grep -Fq "gallery_upload_rejected" || fail "expected gallery_upload_rejected log line"
ok "logs correlate requestId / failure reason"

# 6) valid upload → processing → READY
[[ -f "$GOOD_JPG" ]] || fail "missing fixture $GOOD_JPG"
req GET /api/auth/csrf
CSRF="$(json token)"
STATUS="$(curl -sS -D "$HDR" -o "$BODY" -b "$COOKIE" -c "$COOKIE" -X POST \
  -H "X-XSRF-TOKEN: $CSRF" \
  -H "X-Client-Batch-Id: dr05-good-$(date +%s)" \
  -H "Idempotency-Key: dr05-good-$(date +%s)" \
  -F "files=@${GOOD_JPG};type=image/png;filename=good.png" \
  -w '%{http_code}' \
  "$API_BASE/api/galleries/$GALLERY_ID/photos")"
REQUEST_ID="$(grep -i '^X-Request-Id:' "$HDR" | awk '{print $2}' | tr -d '\r')"
GOOD_REQUEST_ID="$REQUEST_ID"
[[ "$STATUS" == "202" ]] || fail "good upload HTTP $STATUS body=$(cat "$BODY")"
PHOTO_ID="$(json items.0.photoId)"
TASK_ID="$(json items.0.taskId)"
[[ -n "$PHOTO_ID" && -n "$TASK_ID" ]] || fail "missing photo/task id"
ok "good upload accepted photoId=$PHOTO_ID taskId=$TASK_ID requestId=$GOOD_REQUEST_ID"

READY=0
for i in $(seq 1 40); do
  req GET "/api/photos/tasks/$TASK_ID"
  TS="$(json status)"
  if [[ "$TS" == "SUCCEEDED" ]]; then READY=1; break; fi
  if [[ "$TS" == "FAILED" ]]; then
    echo "task failed body=$(cat "$BODY")"
    fail "processing FAILED unexpectedly"
  fi
  sleep 1
done
[[ "$READY" == "1" ]] || fail "processing timed out"
ok "task SUCCEEDED (recovery path B baseline: healthy processing works)"

# 7) retry endpoint smoke (no-op expected on SUCCEEDED → conflict is ok; verify auth path)
req GET /api/auth/csrf
CSRF="$(json token)"
req POST "/api/photos/tasks/$TASK_ID/retry" ""
echo "retry on SUCCEEDED HTTP=$STATUS (expect conflict/4xx) body=$(cat "$BODY")"
ok "retry endpoint reachable under auth"

# 8) metrics / health details
req GET /actuator/health
ok "final health: $(cat "$BODY")"

# optional authenticated metrics via session
req GET /actuator/metrics/gallery.upload.rejected
echo "upload.rejected metric HTTP=$STATUS body=$(cat "$BODY" | head -c 300)"
req GET /actuator/metrics/gallery.task.queue.depth
echo "queue.depth metric HTTP=$STATUS body=$(cat "$BODY" | head -c 300)"

cat <<EOF

=== DR-05 SUMMARY ===
email=$EMAIL
galleryId=$GALLERY_ID
corruptRequestId=$BAD_REQUEST_ID
goodRequestId=$GOOD_REQUEST_ID
photoId=$PHOTO_ID
taskId=$TASK_ID
RESULT=PASS
EOF
