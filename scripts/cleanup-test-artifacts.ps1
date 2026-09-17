# Remove local Docker acceptance artifacts (MySQL test accounts + temp files)
$ErrorActionPreference = 'Stop'

Write-Host '=== cleanup test artifacts ==='

# Temp files from DR-05 / M7.5 scripts
$patterns = @(
  'vie-dr05-*',
  'vie-m75-*',
  'broken-*.jpg',
  'u.json',
  'u.hdr'
)
foreach ($pat in $patterns) {
  Get-ChildItem -Path $env:TEMP -Filter $pat -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
    Write-Host "removed temp $($_.Name)"
  }
}

# Debug helper script (not part of deliverables)
$dbg = Join-Path $PSScriptRoot '_dbg-unlock.ps1'
if (Test-Path $dbg) {
  Remove-Item $dbg -Force
  Write-Host 'removed scripts/_dbg-unlock.ps1'
}

$sql = @'
SET FOREIGN_KEY_CHECKS=0;
DROP TEMPORARY TABLE IF EXISTS tmp_test_users;
DROP TEMPORARY TABLE IF EXISTS tmp_test_tenants;
CREATE TEMPORARY TABLE tmp_test_users AS
  SELECT id FROM users
  WHERE email LIKE 'dr05-%@example.com'
     OR email LIKE 'm75-%@example.com'
     OR email LIKE 'u-%@example.com'
     OR email LIKE 'gallery-test-%@example.com';
CREATE TEMPORARY TABLE tmp_test_tenants AS
  SELECT DISTINCT m.tenant_id AS id
  FROM membership m
  INNER JOIN tmp_test_users u ON u.id = m.user_id;

UPDATE gallery g
  INNER JOIN tmp_test_tenants t ON t.id = g.tenant_id
  SET g.cover_photo_id = NULL;

DELETE pav FROM photo_asset_variant pav
  INNER JOIN tmp_test_tenants t ON t.id = pav.tenant_id;
DELETE ppt FROM photo_processing_task ppt
  INNER JOIN tmp_test_tenants t ON t.id = ppt.tenant_id;
DELETE p FROM photo p
  INNER JOIN tmp_test_tenants t ON t.id = p.tenant_id;
DELETE sl FROM share_link sl
  INNER JOIN gallery g ON g.id = sl.gallery_id
  INNER JOIN tmp_test_tenants t ON t.id = g.tenant_id;
DELETE gvc FROM gallery_viewer_config gvc
  INNER JOIN gallery g ON g.id = gvc.gallery_id
  INNER JOIN tmp_test_tenants t ON t.id = g.tenant_id;
DELETE gvcv FROM gallery_viewer_config_version gvcv
  INNER JOIN tmp_test_tenants t ON t.id = gvcv.tenant_id;
DELETE g FROM gallery g
  INNER JOIN tmp_test_tenants t ON t.id = g.tenant_id;
DELETE so FROM storage_object so
  INNER JOIN tmp_test_tenants t ON t.id = so.tenant_id;
DELETE qo FROM quota_operation qo
  INNER JOIN tmp_test_tenants t ON t.id = qo.tenant_id;
DELETE tq FROM tenant_quota tq
  INNER JOIN tmp_test_tenants t ON t.id = tq.tenant_id;
DELETE m FROM membership m
  INNER JOIN tmp_test_users u ON u.id = m.user_id;
DELETE prt FROM password_reset_token prt
  INNER JOIN tmp_test_users u ON u.id = prt.user_id;
DELETE FROM users WHERE id IN (SELECT id FROM tmp_test_users);
DELETE FROM tenant WHERE id IN (SELECT id FROM tmp_test_tenants);
SET FOREIGN_KEY_CHECKS=1;
SELECT 'users_remaining' AS k, COUNT(*) AS v FROM users
  WHERE email LIKE 'dr05-%@example.com' OR email LIKE 'm75-%@example.com' OR email LIKE 'u-%@example.com' OR email LIKE 'gallery-test-%@example.com';
'@

$sqlFile = Join-Path $env:TEMP 'vie-cleanup-test.sql'
Set-Content -Path $sqlFile -Value $sql -Encoding ascii
cmd /c "type `"$sqlFile`" | docker exec -i infra-mysql-1 mysql -uvie -pvie_local vie_gallery"
Remove-Item $sqlFile -Force -ErrorAction SilentlyContinue
Write-Host 'MySQL test accounts cleaned'
Write-Host 'RESULT=CLEANED'
