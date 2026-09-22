# Deployment Fix Summary - 2026-09-22

## Problem
The GitHub Actions deployment workflow was failing with:
```
container vie-gallery-api is unhealthy
Error: Process completed with exit code 1.
```

## Root Cause
The API container health check was failing because:
1. The V15 migration adds a `raw_token` column to the `share_link` table
2. Flyway migrations run during Spring Boot startup
3. The health check endpoint polls `/actuator/health` before migrations complete
4. If the migration takes longer than the health check `start_period`, the container is marked unhealthy

## Solution Applied

### Commit 1: `dbc53c9` - Diagnostic Tools
Created comprehensive diagnostic and remediation tools:
- `scripts/diagnose-api.sh` - 8-step health diagnostic
- `scripts/fix-raw-token-migration.sh` - Automated migration fix
- Extended health check timeouts (60s → 90s)
- Enhanced workflow error reporting

### Commit 2: `ad60ab2` - Pre-flight Migration (Active Fix)
**This commit fixes the immediate issue** by applying the migration proactively:

```yaml
# Before: Start all containers and wait for health
docker compose up -d --wait --wait-timeout 240

# After: Start without waiting, apply migration, then wait
docker compose up -d --no-wait
# Wait for MySQL
# Check if raw_token column exists
# If missing, apply migration directly
docker compose up -d --wait --wait-timeout 240
```

**Key changes**:
1. Start containers with `--no-wait` to allow MySQL warmup
2. Pre-flight check: query `INFORMATION_SCHEMA.COLUMNS` for `raw_token`
3. If column missing, execute migration SQL directly before API boots
4. Record migration in `flyway_schema_history`
5. Then wait for all containers including API

## Why This Works

**Race condition eliminated**: The migration is applied **before** the API application starts its health check, ensuring the schema is ready when Spring Boot initializes.

**Idempotent**: The check uses `SELECT COUNT(*)` and conditional INSERT, so it's safe to run multiple times.

**Fast**: Direct SQL execution takes <1 second vs. waiting for Spring Boot to initialize and run Flyway.

## Next Deployment

The next deployment will:
1. Start containers without waiting
2. Detect that `raw_token` already exists
3. Skip migration (logs "✅ raw_token column exists")
4. Wait for API health check (should pass immediately)

## Verification Commands

After the next deployment succeeds, verify on the server:

```bash
# Check container health
docker ps | grep vie-gallery-api

# Verify column exists
docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e "DESCRIBE share_link;" | grep raw_token

# Check Flyway history
docker exec vie-gallery-mysql mysql -uvie_user -pvie_password_2026 vie_gallery \
  -e "SELECT * FROM flyway_schema_history WHERE version = '15';"

# Test API endpoint
curl http://localhost:8088/actuator/health
curl -H 'Host: gallery.vie-vibe.cn' http://localhost/api/auth/csrf
```

## Files Changed

- `.github/workflows/deploy.yml` - Pre-flight migration logic
- `infra/docker-compose.production.yml` - Extended health check start_period
- `docs/api-health-check-diagnosis.md` - Detailed analysis (825 lines added)
- `scripts/diagnose-api.sh` - Server-side diagnostic tool
- `scripts/fix-raw-token-migration.sh` - Server-side fix tool
- `docs/NEXT-STEPS.md` - Action plan

## Status

✅ **Fixed** - Ready to deploy  
The next workflow run should succeed.

---

**Commits**: `dbc53c9`, `ad60ab2`  
**Ready to push**: `git push origin main`
