$ErrorActionPreference = 'SilentlyContinue'
$target = Join-Path $env:LOCALAPPDATA 'UniPlan'
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'UniPlan.lnk'
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'UniPlan'
Remove-Item $desktopShortcut -Force
Remove-Item $startMenu -Recurse -Force
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\UniPlan' -Recurse -Force
Start-Process powershell.exe -ArgumentList '-NoProfile','-WindowStyle','Hidden','-Command',"Start-Sleep -Seconds 2; Remove-Item -LiteralPath '$target' -Recurse -Force" | Out-Null
Write-Host 'UniPlan removido. Os dados do navegador nao sao eliminados automaticamente.'
