#!/bin/bash
# 部署后端到端验证：完整走一遍海报生成链路（在服务器上执行，API 为 localhost:8088）
set -Eeuo pipefail

API_BASE="http://localhost:8088"
EMAIL="poster-verify-$(date +%s)@example.com"
PASSWORD="Test12345678"
WORK="$(mktemp -d)"
COOKIE="$WORK/cookie.txt"
RESP="$WORK/resp.json"
IMAGE="/tmp/poster-verify-fixture.png"
STATUS=""

green() { printf '\033[0;32m[OK]\033[0m %s\n' "$1"; }
red()   { printf '\033[0;31m[FAIL]\033[0m %s\n' "$1"; exit 1; }

jval() { python3 -c "
import json,sys
v=json.load(sys.stdin)
for p in sys.argv[1].split('.'):
    v=v[int(p)] if isinstance(v,list) else v[p]
print(v)
" "$1" < "$RESP"; }

req() { # method endpoint [body] [multipart_file]
  local method="$1" endpoint="$2" body="${3:-}" file="${4:-}"
  local args=(-sS --max-time 60 -X "$method" -b "$COOKIE" -c "$COOKIE" -o "$RESP" -w '%{http_code}')
  [[ "$method" != GET ]] && args+=(-H "X-XSRF-TOKEN: $CSRF")
  if [[ -n "$file" ]]; then
    args+=(-F "files=@$file")
  elif [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' --data "$body")
  fi
  STATUS="$(curl "${args[@]}" "$API_BASE$endpoint")"
}

# 准备测试图片（16KB 截图即可）
cp "$HOME/poster-verify-fixture.png" "$IMAGE" 2>/dev/null || true
[[ -f "$IMAGE" ]] || { red "fixture image missing"; }

req GET /actuator/health
[[ "$STATUS" == 200 ]] || red "API health: $STATUS"
green "API healthy"

req GET /api/auth/csrf
CSRF="$(jval token)"
[[ -n "$CSRF" ]] || red "no csrf token"

req POST /api/auth/register "{\"email\":\"$EMAIL\",\"displayName\":\"Poster Verify\",\"password\":\"$PASSWORD\"}"
[[ "$STATUS" == 201 ]] || red "register: $STATUS $(cat "$RESP")"
green "registered $EMAIL"

req GET /api/auth/csrf; CSRF="$(jval token)"
req POST /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
[[ "$STATUS" == 200 ]] || red "login: $STATUS"
green "logged in"

SLUG="poster-verify-$(date +%s)"
req POST /api/galleries "{\"name\":\"Poster Verify Gallery\",\"slug\":\"$SLUG\",\"visibility\":\"PUBLIC\"}"
[[ "$STATUS" == 201 ]] || red "create gallery: $STATUS $(cat "$RESP")"
GID="$(jval id)"
green "gallery created: $GID"

req POST "/api/galleries/$GID/photos" "" "" "$IMAGE"
[[ "$STATUS" == 202 ]] || red "upload: $STATUS $(cat "$RESP")"
TASK="$(jval items.0.taskId)"
for i in $(seq 1 60); do
  req GET "/api/photos/tasks/$TASK"
  S="$(jval status || true)"
  [[ "$S" == SUCCEEDED ]] && break
  [[ "$S" == FAILED ]] && red "photo processing failed"
  sleep 2
done
[[ "$S" == SUCCEEDED ]] || red "photo processing timeout"
green "photo READY"

req POST "/api/galleries/$GID/publish"
[[ "$STATUS" == 200 ]] || red "publish: $STATUS $(cat "$RESP")"
green "gallery PUBLISHED"

req POST "/api/galleries/$GID/share-poster" '{"template":"MINIMAL"}'
[[ "$STATUS" == 200 ]] || red "share-poster: $STATUS $(cat "$RESP")"
POSTER_URL="$(jval posterUrl)"
green "posterUrl: $POSTER_URL"

# 下载海报验证可访问性
HDRS="$(curl -sS -o "$WORK/poster.png" -D - -w 'HTTP=%{http_code}' "$POSTER_URL")"
echo "$HDRS" | grep -E "HTTP=200|Content-Type: image/" >/dev/null || red "poster download failed: $HDRS"
SIZE=$(stat -c%s "$WORK/poster.png")
[[ "$SIZE" -gt 20000 ]] || red "poster too small: $SIZE bytes"
green "poster downloaded: $SIZE bytes, saved to $WORK/poster.png"

# 预签名 URL 有效期抽样（X-Amz-Expires / Expires 参数）
echo "$POSTER_URL" | grep -oE "(X-Amz-Expires|Expires)=[0-9]+" || echo "(no explicit expiry param found)"
echo "DONE"
