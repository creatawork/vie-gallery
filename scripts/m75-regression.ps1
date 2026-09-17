# M7.5 live Docker regression (Windows PowerShell)
# Covers creator path: auth → gallery → upload/curate → publish → share → public access → revoke/unpublish → password reset
$ErrorActionPreference = 'Stop'
$API = if ($env:API_BASE) { $env:API_BASE } else { 'http://localhost:8088' }
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$PublicSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$Fixture = Join-Path $Root 'spatial-atmosphere-particles-bloom.png'
$email = "m75-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())@example.com"
$password = 'Test12345678'
$newPassword = 'NewPass12345678'
$galleryPassword = 'GalleryUnlock1'
$csrf = $null
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$summary = [ordered]@{}

function Ok([string]$msg) { Write-Host "[OK] $msg" }
function Fail([string]$msg) { Write-Host "FAILED: $msg" -ForegroundColor Red; exit 1 }

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Body = $null,
    $WebSession = $null,
    [hashtable]$ExtraHeaders = $null
  )
  if (-not $WebSession) { $WebSession = $Session }
  # PowerShell may retain prior -Headers on WebSession across calls (e.g. X-Share-Token).
  if ($WebSession.Headers) { $WebSession.Headers.Clear() }
  $uri = "$API$Path"
  $headers = @{}
  if ($csrf -and $Method -ne 'GET') { $headers['X-XSRF-TOKEN'] = $csrf }
  if ($ExtraHeaders) { foreach ($k in $ExtraHeaders.Keys) { $headers[$k] = $ExtraHeaders[$k] } }

  $script:LastStatus = 0
  $script:LastBody = ''
  $script:LastRequestId = $null
  $script:LastJson = $null

  try {
    $params = @{
      Uri = $uri
      Method = $Method
      WebSession = $WebSession
      UseBasicParsing = $true
    }
    if ($headers.Count -gt 0) { $params['Headers'] = $headers }
    if ($Body) {
      $params['ContentType'] = 'application/json; charset=utf-8'
      $params['Body'] = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress -Depth 8))
    }
    $resp = Invoke-WebRequest @params
    $script:LastStatus = [int]$resp.StatusCode
    $content = $resp.Content
    if ($content -is [byte[]]) {
      $script:LastBody = [System.Text.Encoding]::UTF8.GetString($content)
    } else {
      $script:LastBody = [string]$content
    }
    if ($resp.Headers['X-Request-Id']) {
      $rid = $resp.Headers['X-Request-Id']
      $script:LastRequestId = if ($rid -is [array]) { [string]$rid[0] } else { [string]$rid }
    }
  } catch [System.Net.WebException] {
    $webResp = $_.Exception.Response
    if (-not $webResp) { throw }
    $script:LastStatus = [int]$webResp.StatusCode
    $reader = New-Object System.IO.StreamReader($webResp.GetResponseStream())
    $script:LastBody = $reader.ReadToEnd()
    $reader.Close()
    $ridHeader = $webResp.Headers['X-Request-Id']
    if ($ridHeader) { $script:LastRequestId = [string]$ridHeader }
  }
  try { $script:LastJson = $script:LastBody | ConvertFrom-Json } catch { $script:LastJson = $null }
}

function Refresh-Csrf([object]$WebSession = $null) {
  if (-not $WebSession) { $WebSession = $Session }
  Invoke-Json GET /api/auth/csrf $null $WebSession
  $script:csrf = $LastJson.token
  if (-not $script:csrf) { Fail 'missing csrf' }
}

function Invoke-Upload {
  param([string]$GalleryId, [string]$FilePath, [string]$ContentType = 'image/png')
  $hdrFile = Join-Path $env:TEMP ("vie-m75-up-hdr-{0}.txt" -f $PID)
  $outFile = Join-Path $env:TEMP ("vie-m75-up-body-{0}.json" -f $PID)
  $cookieHeader = ($Session.Cookies.GetCookies([Uri]$API) | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '; '
  $fname = Split-Path $FilePath -Leaf
  $argsList = New-Object System.Collections.Generic.List[string]
  foreach ($a in @('-sS','-D',$hdrFile,'-o',$outFile,'-X','POST')) { [void]$argsList.Add($a) }
  [void]$argsList.Add('-H'); [void]$argsList.Add("Cookie: $cookieHeader")
  [void]$argsList.Add('-H'); [void]$argsList.Add("X-XSRF-TOKEN: $csrf")
  [void]$argsList.Add('-H'); [void]$argsList.Add(('X-Client-Batch-Id: m75-{0}' -f [guid]::NewGuid().ToString()))
  [void]$argsList.Add('-H'); [void]$argsList.Add(('Idempotency-Key: m75-{0}' -f [guid]::NewGuid().ToString()))
  [void]$argsList.Add('-F')
  [void]$argsList.Add(('files=@{0};type={1};filename={2}' -f $FilePath, $ContentType, $fname))
  [void]$argsList.Add(("$API/api/galleries/{0}/photos" -f $GalleryId))

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'curl.exe'
  $psi.Arguments = ($argsList | ForEach-Object {
    if ($_ -match '[\s"]') { '"' + ($_ -replace '"','\"') + '"' } else { $_ }
  }) -join ' '
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $stderr = $p.StandardError.ReadToEnd()
  [void]$p.StandardOutput.ReadToEnd()
  $p.WaitForExit()
  if ($p.ExitCode -ne 0 -and -not (Test-Path $hdrFile)) {
    Fail "curl upload failed exit=$($p.ExitCode) stderr=$stderr"
  }
  $statusLine = Select-String -Path $hdrFile -Pattern '^HTTP/' | Select-Object -Last 1
  $script:LastStatus = if ($statusLine) { ($statusLine.Line -split '\s+')[1] } else { '' }
  $script:LastBody = Get-Content $outFile -Raw -ErrorAction SilentlyContinue
  $rid = Select-String -Path $hdrFile -Pattern '^X-Request-Id:' | Select-Object -First 1
  $script:LastRequestId = if ($rid) { ($rid.Line -split ':',2)[1].Trim() } else { $null }
  try { $script:LastJson = $script:LastBody | ConvertFrom-Json } catch { $script:LastJson = $null }
}

function Wait-Task([string]$TaskId) {
  for ($i = 0; $i -lt 60; $i++) {
    Invoke-Json GET "/api/photos/tasks/$TaskId"
    if ($LastJson.status -eq 'SUCCEEDED') { return }
    if ($LastJson.status -eq 'FAILED') { Fail "task FAILED: $LastBody" }
    Start-Sleep -Seconds 1
  }
  Fail "task timeout $TaskId"
}

function New-ReadyGallery {
  param([string]$Name, [string]$Visibility)
  Refresh-Csrf
  $slug = ("m75-{0}-{1}" -f $Visibility.ToLowerInvariant(), $stamp)
  Invoke-Json POST /api/galleries @{ name = $Name; slug = $slug; visibility = $Visibility }
  if ($LastStatus -ne 201) { Fail "create $Visibility gallery HTTP $LastStatus body=$LastBody" }
  $gid = $LastJson.id
  Refresh-Csrf
  if (-not (Test-Path $Fixture)) { Fail "missing fixture $Fixture" }
  Invoke-Upload -GalleryId $gid -FilePath $Fixture
  if ("$LastStatus" -ne '202') { Fail "upload $Visibility HTTP $LastStatus body=$LastBody" }
  $photoId = $LastJson.items[0].photoId
  $taskId = $LastJson.items[0].taskId
  if (-not $photoId -or -not $taskId) { Fail "upload missing ids: $LastBody" }
  Wait-Task $taskId
  Refresh-Csrf
  Invoke-Json PATCH "/api/photos/$photoId" @{ title = 'M75 Cover'; cover = $true }
  if ($LastStatus -ne 200) { Fail "set cover HTTP $LastStatus body=$LastBody" }
  Refresh-Csrf
  Invoke-Json PUT "/api/galleries/$gid/viewer-config" @{
    configJson = '{"layout":"ring","visitorAllowDownload":true}'
    presetName = 'm75'
    schemaVersion = 1
  }
  if ($LastStatus -notin 200, 201) { Fail "save viewer-config HTTP $LastStatus body=$LastBody" }
  Refresh-Csrf
  Invoke-Json POST "/api/galleries/$gid/viewer-config/publish" @{}
  if ($LastStatus -ne 200) { Fail "publish viewer-config HTTP $LastStatus body=$LastBody" }
  Refresh-Csrf
  Invoke-Json GET "/api/galleries/$gid/publish-readiness"
  if ($LastStatus -ne 200) { Fail "publish-readiness HTTP $LastStatus" }
  Refresh-Csrf
  Invoke-Json POST "/api/galleries/$gid/publish" @{}
  if ($LastStatus -ne 200) { Fail "publish gallery HTTP $LastStatus body=$LastBody" }
  if ($LastJson.status -ne 'PUBLISHED') { Fail "expected PUBLISHED got $($LastJson.status)" }
  return @{ id = $gid; slug = $slug; photoId = $photoId; taskId = $taskId }
}

Write-Host "=== M7.5 live regression @ $API ==="
Write-Host "email=$email"
$summary.email = $email

Invoke-Json GET /actuator/health
if ($LastStatus -ne 200 -or $LastBody -notmatch '"status"\s*:\s*"UP"') { Fail "health not UP: $LastBody" }
Ok "health UP"

Refresh-Csrf
Invoke-Json POST /api/auth/register @{ email = $email; displayName = 'M75'; password = $password }
if ($LastStatus -ne 201) { Fail "register HTTP $LastStatus body=$LastBody" }
Ok 'registered'

Refresh-Csrf
Invoke-Json POST /api/auth/login @{ email = $email; password = $password }
if ($LastStatus -ne 200) { Fail "login HTTP $LastStatus body=$LastBody" }
Ok 'login'

Invoke-Json GET /api/me
if ($LastStatus -ne 200 -or $LastJson.user.email -ne $email) { Fail "me mismatch: $LastBody" }
Ok 'GET /api/me'

$public = New-ReadyGallery 'M75 Public' 'PUBLIC'
$summary.publicGalleryId = $public.id
$summary.publicSlug = $public.slug
Ok "PUBLIC published $($public.slug)"

$csrf = $null
Invoke-Json GET "/api/public/g/$($public.slug)" $null $PublicSession
if ($LastStatus -ne 200) { Fail "public access HTTP $LastStatus body=$LastBody" }
if ($LastJson.accessState -ne 'READY') { Fail "PUBLIC accessState=$($LastJson.accessState)" }
Ok 'PUBLIC visitor READY'

$private = New-ReadyGallery 'M75 Private' 'PRIVATE'
$summary.privateGalleryId = $private.id
$summary.privateSlug = $private.slug
Ok "PRIVATE published $($private.slug)"

Refresh-Csrf
Invoke-Json POST "/api/galleries/$($private.id)/share-links" @{ expiresInDays = 7 }
if ($LastStatus -ne 201) { Fail "create share HTTP $LastStatus body=$LastBody" }
$shareId = $LastJson.id
$shareToken = $LastJson.rawToken
if (-not $shareId -or -not $shareToken) { Fail "share missing id/rawToken: $LastBody" }
Ok 'PRIVATE share link created (rawToken only in create response)'

$csrf = $null
Invoke-Json GET "/api/public/g/$($private.slug)" $null $PublicSession
if ($LastJson.accessState -ne 'SHARE_LINK_REQUIRED') { Fail "expected SHARE_LINK_REQUIRED got $($LastJson.accessState)" }
Ok 'PRIVATE without token requires share'

Invoke-Json -Method GET -Path "/api/public/g/$($private.slug)" -WebSession $PublicSession -ExtraHeaders @{ 'X-Share-Token' = $shareToken }
if ($LastJson.accessState -ne 'READY') { Fail "tokenized private accessState=$($LastJson.accessState) body=$LastBody" }
Ok 'PRIVATE with share token READY'

Refresh-Csrf
Invoke-Json DELETE "/api/share-links/$shareId"
if ($LastStatus -notin 200, 204) { Fail "revoke share HTTP $LastStatus body=$LastBody" }
Ok 'share revoked'

$csrf = $null
Invoke-Json -Method GET -Path "/api/public/g/$($private.slug)" -WebSession $PublicSession -ExtraHeaders @{ 'X-Share-Token' = $shareToken }
if ($LastJson.accessState -eq 'READY') { Fail 'revoked token still grants READY' }
Ok "revoked token no longer READY (state=$($LastJson.accessState))"

$passwordGal = New-ReadyGallery 'M75 Password' 'PASSWORD'
$summary.passwordGalleryId = $passwordGal.id
$summary.passwordSlug = $passwordGal.slug
Ok "PASSWORD published $($passwordGal.slug)"

Refresh-Csrf
Invoke-Json PUT "/api/galleries/$($passwordGal.id)/password" @{ password = $galleryPassword }
if ($LastStatus -ne 200) { Fail "set gallery password HTTP $LastStatus body=$LastBody" }
Ok 'gallery password set'

# Fresh visitor session — avoid sticky X-Share-Token from PRIVATE flow on WebRequestSession.Headers
$PublicSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$csrf = $null
Invoke-Json GET "/api/public/g/$($passwordGal.slug)" $null $PublicSession
if ($LastJson.accessState -ne 'PASSWORD_REQUIRED') { Fail "expected PASSWORD_REQUIRED got $($LastJson.accessState) body=$LastBody" }
Ok 'PASSWORD_REQUIRED before unlock'

Refresh-Csrf $PublicSession
Invoke-Json POST "/api/public/g/$($passwordGal.slug)/unlock" @{ password = $galleryPassword } $PublicSession
if ($LastStatus -ne 200) { Fail "unlock HTTP $LastStatus body=$LastBody" }
Ok 'password unlock'

Invoke-Json GET "/api/public/g/$($passwordGal.slug)" $null $PublicSession
if ($LastJson.accessState -ne 'READY') { Fail "after unlock accessState=$($LastJson.accessState)" }
Ok 'PASSWORD gallery READY after unlock'

Refresh-Csrf
Invoke-Json POST "/api/galleries/$($public.id)/unpublish" @{}
if ($LastStatus -ne 200) { Fail "unpublish HTTP $LastStatus body=$LastBody" }
Ok 'PUBLIC unpublished'

$csrf = $null
Invoke-Json GET "/api/public/g/$($public.slug)" $null $PublicSession
# draft/unpublished should be not ready / 404-ish
if ($LastStatus -eq 200 -and $LastJson.accessState -eq 'READY') { Fail 'unpublished gallery still READY' }
Ok "unpublished public no longer READY (HTTP=$LastStatus state=$($LastJson.accessState))"

# Password reset path (dev LoggingEmailAdapter)
Refresh-Csrf
Invoke-Json POST /api/auth/logout @{}
# logout may be 204
Ok "logout HTTP=$LastStatus"

$anon = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$Session = $anon
Refresh-Csrf
Invoke-Json POST /api/auth/forgot-password @{ email = $email }
if ($LastStatus -ne 200) { Fail "forgot-password HTTP $LastStatus body=$LastBody" }
Ok 'forgot-password accepted'

Start-Sleep -Seconds 1
$apiLogs = Join-Path $env:TEMP ("vie-m75-api-logs-{0}.txt" -f $PID)
docker logs infra-gallery-api-1 2>&1 | ForEach-Object { $_.ToString() } | Set-Content -Path $apiLogs -Encoding utf8
$tokenLine = Select-String -Path $apiLogs -Pattern 'Reset Token:\s+(\S+)' | Select-Object -Last 1
if (-not $tokenLine) { Fail 'reset token not found in API logs' }
$resetToken = $tokenLine.Matches[0].Groups[1].Value
if ($resetToken.Length -lt 20) { Fail "reset token too short: $resetToken" }
Ok 'captured reset token from dev email log'

Refresh-Csrf
Invoke-Json POST /api/auth/reset-password @{ token = $resetToken; newPassword = $newPassword }
if ($LastStatus -ne 200) { Fail "reset-password HTTP $LastStatus body=$LastBody" }
Ok 'password reset'

Refresh-Csrf
Invoke-Json POST /api/auth/login @{ email = $email; password = $password }
if ($LastStatus -eq 200) { Fail 'old password still works after reset' }
Ok "old password rejected HTTP=$LastStatus"

Refresh-Csrf
Invoke-Json POST /api/auth/login @{ email = $email; password = $newPassword }
if ($LastStatus -ne 200) { Fail "login with new password HTTP $LastStatus body=$LastBody" }
Ok 'login with new password'

Invoke-Json GET /actuator/health
Ok "final health HTTP=$LastStatus"

Write-Host ''
Write-Host '=== M7.5 SUMMARY ==='
foreach ($k in $summary.Keys) { Write-Host "$k=$($summary[$k])" }
Write-Host 'RESULT=PASS'
