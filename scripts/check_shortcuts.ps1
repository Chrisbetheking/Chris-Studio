# check_shortcuts.ps1 - TokenFence Studio v1.5.6 Shortcut Diagnostics
$ErrorActionPreference = "Continue"
$version = "v1.5.6"
$expectedPath = "E:\Apps\TokenFenceStudio\$version\TokenFence Studio.exe"
$oldVersions = @("v1.3.7","v1.3.8","v1.3.9","v1.4.0","v1.4.1","v1.4.2","v1.4.3","v1.4.4")
$oldPaths = @(
  "$env:LOCALAPPDATA\TokenFence Studio",
  "$env:USERPROFILE\Documents\tokenfence-studio-clone",
  "D:\tokenfence-studio"
)

$results = @()

# Check desktop shortcut
$desktopSC = "$env:USERPROFILE\Desktop\TokenFence Studio.lnk"
if (Test-Path $desktopSC) {
  $shell = New-Object -ComObject WScript.Shell
  $sc = $shell.CreateShortcut($desktopSC)
  $isOld = $false
  foreach ($ov in $oldVersions) { if ($sc.TargetPath -match $ov) { $isOld = $true; break } }
  foreach ($op in $oldPaths) { if ($sc.TargetPath -match [regex]::Escape($op)) { $isOld = $true; break } }
  $isCurrent = $sc.TargetPath -eq $expectedPath
  $results += [PSCustomObject]@{
    Shortcut = "Desktop"
    TargetPath = $sc.TargetPath
    WorkingDirectory = $sc.WorkingDirectory
    IsCurrentVersion = $isCurrent
    IsOld = $isOld
  }
} else {
  $results += [PSCustomObject]@{ Shortcut = "Desktop"; TargetPath = "NOT FOUND"; WorkingDirectory = ""; IsCurrentVersion = $false; IsOld = $false }
}

# Check Start Menu shortcut
$startSC = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\TokenFence Studio.lnk"
if (Test-Path $startSC) {
  $shell = New-Object -ComObject WScript.Shell
  $sc = $shell.CreateShortcut($startSC)
  $isOld = $false
  foreach ($ov in $oldVersions) { if ($sc.TargetPath -match $ov) { $isOld = $true; break } }
  foreach ($op in $oldPaths) { if ($sc.TargetPath -match [regex]::Escape($op)) { $isOld = $true; break } }
  $isCurrent = $sc.TargetPath -eq $expectedPath
  $results += [PSCustomObject]@{
    Shortcut = "Start Menu"
    TargetPath = $sc.TargetPath
    WorkingDirectory = $sc.WorkingDirectory
    IsCurrentVersion = $isCurrent
    IsOld = $isOld
  }
} else {
  $results += [PSCustomObject]@{ Shortcut = "Start Menu"; TargetPath = "NOT FOUND"; WorkingDirectory = ""; IsCurrentVersion = $false; IsOld = $false }
}

# Check running processes
$processes = Get-Process | Where-Object { $_.ProcessName -match "TokenFence|tokenfence" }
if ($processes) {
  foreach ($p in $processes) {
    $results += [PSCustomObject]@{
      Shortcut = "Running Process (PID $($p.Id))"
      TargetPath = $p.Path
      WorkingDirectory = ""
      IsCurrentVersion = $p.Path -eq $expectedPath
      IsOld = ($oldVersions | Where-Object { $p.Path -match $_ }) -or ($oldPaths | Where-Object { $p.Path -match [regex]::Escape($_) })
    }
  }
} else {
  $results += [PSCustomObject]@{ Shortcut = "Running Process"; TargetPath = "NONE RUNNING"; WorkingDirectory = ""; IsCurrentVersion = $false; IsOld = $false }
}

# Output
Write-Host "=== TokenFence Studio Shortcut Diagnostics ==="
Write-Host "Expected path: $expectedPath"
Write-Host ""
$results | Format-Table -AutoSize

$warnings = $results | Where-Object { $_.IsOld -eq $true }
if ($warnings) {
  Write-Host "WARNING: The following point to old versions:" -ForegroundColor Yellow
  $warnings | Format-Table -AutoSize
}

Write-Host ""
Write-Host "If the pinned taskbar shortcut still points to an old version, unpin it manually and re-pin the currently running window."
