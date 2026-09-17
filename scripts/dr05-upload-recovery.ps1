# DR-05 real acceptance (Windows PowerShell 5+)
# JSON via Invoke-WebRequest; multipart upload via curl.exe
$ErrorActionPreference = 'Stop'
$API = if ($env:API_BASE) { $env:API_BASE } else { 'http://localhost:8088' }
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$GoodJpg = Join-Path $Root 'spatial-atmosphere-particles-bloom.png'
$BadJpg = Join-Path $env:TEMP ("broken-{0}.jpg" -f $PID)
[System.IO.File]::WriteAllText($BadJpg, 'not-a-real-jpeg')
$email = "dr05-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())@example.com"
$password = 'Test12345678'
$csrf = $null

function Ok([string]$msg) { Write-Host "[OK] $msg" }
function Fail([string]$msg) { Write-Host "FAILED: $msg" -ForegroundColor Red; exit 1 }

function Invoke-Json {
  param([string]$Method, [string]$Path, [hashtable]$Body = $null)
  $uri = "$API$Path"
  $headers = @{}
  if ($csrf -and $Method -ne 'GET') { $headers['X-XSRF-TOKEN'] = $csrf }

  $script:LastStatus = 0
  $script:LastBody = ''
  $script:LastRequestId = $null
  $script:LastJson = $null

  try {
    $params = @{
      Uri = $uri
      Method = $Method
      WebSession = $Session
      UseBasicParsing = $true
    }
    if ($headers.Count -gt 0) { $params['Headers'] = $headers }
    if ($Body) {
      $params['ContentType'] = 'application/json; charset=utf-8'
      $params['Body'] = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress))
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
    $stream = $webResp.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $script:LastBody = $reader.ReadToEnd()
    $reader.Close()
    $ridHeader = $webResp.Headers['X-Request-Id']
    if ($ridHeader) { $script:LastRequestId = [string]$ridHeader }
  }
  try { $script:LastJson = $script:LastBody | ConvertFrom-Json } catch { $script:LastJson = $null }
}

function Invoke-Upload {
  param([string]$GalleryId, [string]$FilePath, [string]$ContentType)
  $hdrFile = Join-Path $env:TEMP ("vie-dr05-up-hdr-{0}.txt" -f $PID)
  $outFile = Join-Path $env:TEMP ("vie-dr05-up-body-{0}.json" -f $PID)
  $cookieHeader = ($Session.Cookies.GetCookies([Uri]$API) | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join '; '
  $fname = Split-Path $FilePath -Leaf
  # Build argv as List so leading @file is never PowerShell-splatted
  $argsList = New-Object System.Collections.Generic.List[string]
  foreach ($a in @('-sS','-D',$hdrFile,'-o',$outFile,'-X','POST')) { [void]$argsList.Add($a) }
  [void]$argsList.Add('-H'); [void]$argsList.Add("Cookie: $cookieHeader")
  [void]$argsList.Add('-H'); [void]$argsList.Add("X-XSRF-TOKEN: $csrf")
  [void]$argsList.Add('-H'); [void]$argsList.Add(('X-Client-Batch-Id: dr05-{0}' -f [guid]::NewGuid().ToString()))
  [void]$argsList.Add('-H'); [void]$argsList.Add(('Idempotency-Key: dr05-{0}' -f [guid]::NewGuid().ToString()))
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

Write-Host "=== DR-05 real acceptance @ $API ==="
Write-Host "email=$email"

Invoke-Json GET /actuator/health
if ($LastStatus -ne 200) { Fail "health HTTP $LastStatus body=$LastBody" }
if ($LastBody -notmatch '"status"\s*:\s*"UP"') { Fail "health not UP: $LastBody" }
Ok "API health UP (requestId=$LastRequestId)"

Invoke-Json GET /api/auth/csrf
$csrf = $LastJson.token
if (-not $csrf) { Fail 'missing csrf' }

Invoke-Json POST /api/auth/register @{ email = $email; displayName = 'DR05'; password = $password }
if ($LastStatus -ne 201) { Fail "register HTTP $LastStatus body=$LastBody" }
Ok "registered (requestId=$LastRequestId)"

Invoke-Json GET /api/auth/csrf
$csrf = $LastJson.token

$slug = "dr05-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
Invoke-Json POST /api/galleries @{ name = 'DR05 Gallery'; slug = $slug; visibility = 'PRIVATE' }
if ($LastStatus -ne 201) { Fail "create gallery HTTP $LastStatus body=$LastBody" }
$galleryId = $LastJson.id
Ok "gallery created id=$galleryId"

Invoke-Json GET /api/auth/csrf
$csrf = $LastJson.token
Invoke-Upload -GalleryId $galleryId -FilePath $BadJpg -ContentType 'image/jpeg'
$badRequestId = $LastRequestId
Write-Host "corrupt upload HTTP=$LastStatus requestId=$badRequestId body=$LastBody"
if ("$LastStatus" -ne '202') { Fail "unexpected HTTP $LastStatus" }
$item = $LastJson.items[0]
if ($item.accepted -ne $false) { Fail 'corrupt file should not be accepted' }
if ($item.error.code -ne 'IMAGE_DECODE_FAILED') { Fail "unexpected error $($item.error.code)" }
if (-not $badRequestId) { Fail 'missing X-Request-Id' }
Ok "corrupt upload rejected code=$($item.error.code) requestId=$badRequestId"

Start-Sleep -Seconds 1
$apiLogs = Join-Path $env:TEMP ("vie-dr05-api-logs-{0}.txt" -f $PID)
docker logs infra-gallery-api-1 2>&1 | ForEach-Object { $_.ToString() } | Set-Content -Path $apiLogs -Encoding utf8
$logHit = Select-String -Path $apiLogs -Pattern ([regex]::Escape($badRequestId)) | Select-Object -Last 8
Write-Host 'log sample:'
$logHit | ForEach-Object { Write-Host $_.Line }
if (-not $logHit) { Fail 'could not find requestId in docker logs' }
if (-not ($logHit | Where-Object { $_.Line -match 'gallery_upload_rejected' })) { Fail 'expected gallery_upload_rejected' }
Ok 'logs correlate requestId / failure reason'

if (-not (Test-Path $GoodJpg)) { Fail "missing fixture $GoodJpg" }
Invoke-Json GET /api/auth/csrf
$csrf = $LastJson.token
Invoke-Upload -GalleryId $galleryId -FilePath $GoodJpg -ContentType 'image/png'
$goodRequestId = $LastRequestId
if ("$LastStatus" -ne '202') { Fail "good upload HTTP $LastStatus body=$LastBody" }
$photoId = $LastJson.items[0].photoId
$taskId = $LastJson.items[0].taskId
if (-not $photoId -or -not $taskId) { Fail "missing photo/task id body=$LastBody" }
Ok "good upload accepted photoId=$photoId taskId=$taskId requestId=$goodRequestId"

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Invoke-Json GET "/api/photos/tasks/$taskId"
  if ($LastJson.status -eq 'SUCCEEDED') { $ready = $true; break }
  if ($LastJson.status -eq 'FAILED') { Fail "processing FAILED: $LastBody" }
  Start-Sleep -Seconds 1
}
if (-not $ready) { Fail 'processing timed out' }
Ok 'task SUCCEEDED'

docker logs infra-gallery-api-1 2>&1 | ForEach-Object { $_.ToString() } | Set-Content -Path $apiLogs -Encoding utf8
$taskLog = Select-String -Path $apiLogs -Pattern ([regex]::Escape("$taskId")) | Select-Object -Last 5
Write-Host 'task log sample:'
$taskLog | ForEach-Object { Write-Host $_.Line }
if (-not $taskLog) { Fail "taskId $taskId not found in logs" }
Ok 'logs correlate taskId / processing'

Invoke-Json GET /api/auth/csrf
$csrf = $LastJson.token
Invoke-Json POST "/api/photos/tasks/$taskId/retry" @{}
Write-Host "retry on SUCCEEDED HTTP=$LastStatus body=$LastBody"
Ok 'retry endpoint reachable under auth'

Invoke-Json GET /actuator/health
Ok "final health status HTTP=$LastStatus"

Write-Host ''
Write-Host '=== DR-05 SUMMARY ==='
Write-Host "email=$email"
Write-Host "galleryId=$galleryId"
Write-Host "corruptRequestId=$badRequestId"
Write-Host "goodRequestId=$goodRequestId"
Write-Host "photoId=$photoId"
Write-Host "taskId=$taskId"
Write-Host 'RESULT=PASS'
