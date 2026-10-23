# Weekly backup of Home Together into OneDrive (see README, "Backups").
# Reads everything through the read-only "backup" function. Its key is kept in key.txt next to this
# script, encrypted by Windows for this user on this PC only (DPAPI), so a copied key.txt is useless elsewhere.
# Keeps the last 8 backups; writes one line per run to backup.log.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$url  = "https://mqqdqrgvayqgtruaspdu.supabase.co/functions/v1/backup"
$dest = Join-Path $env:OneDrive "Home Together backups"
$keep = 8
$log  = Join-Path $here "backup.log"
function Log($msg) { "$(Get-Date -Format s)  $msg" | Add-Content -Path $log -Encoding utf8 }

try {
  $secure = Get-Content (Join-Path $here "key.txt") | ConvertTo-SecureString
  $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  $res = Invoke-WebRequest -Method Post -Uri $url -Headers @{ "x-backup-secret" = $key } -UseBasicParsing -TimeoutSec 180
  $text = [Text.Encoding]::UTF8.GetString($res.RawContentStream.ToArray())

  $folder = Join-Path $dest (Get-Date -Format "yyyy-MM-dd")
  New-Item -ItemType Directory -Force (Join-Path $folder "files") | Out-Null
  [IO.File]::WriteAllText((Join-Path $folder "data.json"), $text, (New-Object Text.UTF8Encoding $false))

  # Windows PowerShell's ConvertFrom-Json stops at 2 MB, so parse with a larger limit.
  Add-Type -AssemblyName System.Web.Extensions
  $json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $json.MaxJsonLength = [int]::MaxValue
  $data = $json.DeserializeObject($text)

  $ok = 0; $failed = 0
  foreach ($f in $data["files"]) {
    if (-not $f["url"]) { $failed++; continue }
    $target = Join-Path (Join-Path $folder "files") ($f["path"] -replace "/", "\")
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    try { Invoke-WebRequest -Uri $f["url"] -OutFile $target -UseBasicParsing -TimeoutSec 180; $ok++ } catch { $failed++ }
  }

  Get-ChildItem $dest -Directory | Where-Object Name -match '^\d{4}-\d{2}-\d{2}$' |
    Sort-Object Name -Descending | Select-Object -Skip $keep | Remove-Item -Recurse -Force

  $note = if ($failed) { ", $failed could not be downloaded" } else { "" }
  Log "OK      $folder  ($ok files$note)"
} catch {
  Log "FAILED  $($_.Exception.Message)"
  exit 1
}
