# test_project_scan.ps1 - TokenFence Studio v1.5.5 Scanner Self-Test
# Tests that the project path exists and has expected contents

$testPath = "E:\Dev\tokenfence-studio-clean"
$report = @()

$report += "=== TokenFence Studio v1.5.5 Scanner Self-Test ==="
$report += "Test path: $testPath"
$report += ""

# Test 1: Path exists
$exists = Test-Path $testPath
$report += "Test-Path: $exists"
if (-not $exists) {
  $report += "FAIL: Path does not exist"
  $report -join "`n" | Out-File "$PSScriptRoot\scan_test_result.txt" -Encoding UTF8
  Write-Output ($report -join "`n")
  exit 1
}

# Test 2: Is directory
$item = Get-Item $testPath
$isDir = $item.PSIsContainer
$report += "Is-Directory: $isDir"
if (-not $isDir) {
  $report += "FAIL: Path is not a directory"
  $report -join "`n" | Out-File "$PSScriptRoot\scan_test_result.txt" -Encoding UTF8
  Write-Output ($report -join "`n")
  exit 1
}

# Test 3: Top-level entries
$entries = Get-ChildItem $testPath -Force
$entryCount = $entries.Count
$report += "PowerShell top-level entries count: $entryCount"
if ($entryCount -eq 0) {
  $report += "FAIL: No entries found"
}

# Test 4: Key files/dirs
$checks = @(
  @{Name="README.md"; Type="file"},
  @{Name="package.json"; Type="file"},
  @{Name="apps"; Type="dir"},
  @{Name="scripts"; Type="dir"},
  @{Name=".git"; Type="dir"},
  @{Name="node_modules"; Type="dir"}
)

foreach ($check in $checks) {
  $childPath = Join-Path $testPath $check.Name
  $childExists = Test-Path $childPath
  $report += "$($check.Name) exists: $childExists"
}

# Test 5: Entry listing (names only, top 30)
$report += ""
$report += "Top-level entries:"
$entries | Select-Object -First 30 | ForEach-Object {
  $type = if ($_.PSIsContainer) { "[DIR] " } else { "[FILE]" }
  $report += "  $type $($_.Name)"
}

# Test 6: Count by type
$dirs = ($entries | Where-Object { $_.PSIsContainer }).Count
$files = ($entries | Where-Object { -not $_.PSIsContainer }).Count
$report += ""
$report += "Directories: $dirs"
$report += "Files: $files"

$report += ""
$report += "=== Self-test complete ==="

$result = $report -join "`n"
$result | Out-File "$PSScriptRoot\scan_test_result.txt" -Encoding UTF8
Write-Output $result
