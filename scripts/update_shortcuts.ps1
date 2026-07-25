# update_shortcuts.ps1 - TokenFence Studio v1.5.6 Shortcut Updater
$ErrorActionPreference = "Continue"
$version = "v1.5.6"
$targetPath = "E:\Apps\TokenFenceStudio\$version\TokenFence Studio.exe"
$workingDir = "E:\Apps\TokenFenceStudio\$version"

$shell = New-Object -ComObject WScript.Shell

# Update Desktop shortcut
$desktopSC = "$env:USERPROFILE\Desktop\TokenFence Studio.lnk"
if (Test-Path $desktopSC) {
  $sc = $shell.CreateShortcut($desktopSC)
  $sc.TargetPath = $targetPath
  $sc.WorkingDirectory = $workingDir
  $sc.Arguments = ""
  $sc.Save()
  Write-Host "Desktop shortcut updated to $targetPath"
} else {
  Write-Host "Desktop shortcut not found, creating..."
  $sc = $shell.CreateShortcut($desktopSC)
  $sc.TargetPath = $targetPath
  $sc.WorkingDirectory = $workingDir
  $sc.Save()
  Write-Host "Desktop shortcut created"
}

# Update Start Menu shortcut
$startSC = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\TokenFence Studio.lnk"
if (Test-Path $startSC) {
  $sc = $shell.CreateShortcut($startSC)
  $sc.TargetPath = $targetPath
  $sc.WorkingDirectory = $workingDir
  $sc.Arguments = ""
  $sc.Save()
  Write-Host "Start Menu shortcut updated to $targetPath"
} else {
  Write-Host "Start Menu shortcut not found, creating..."
  $startDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
  if (-not (Test-Path $startDir)) { New-Item -ItemType Directory -Path $startDir -Force }
  $sc = $shell.CreateShortcut($startSC)
  $sc.TargetPath = $targetPath
  $sc.WorkingDirectory = $workingDir
  $sc.Save()
  Write-Host "Start Menu shortcut created"
}

Write-Host ""
Write-Host "Shortcuts updated to v1.5.6"
Write-Host "Taskbar pinned shortcuts should be manually unpinned and re-pinned from the running v1.5.6 window."
