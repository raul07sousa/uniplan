$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $env:LOCALAPPDATA 'UniPlan'
$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'UniPlan'

New-Item -ItemType Directory -Path $target -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $target 'js') -Force | Out-Null
New-Item -ItemType Directory -Path $startMenu -Force | Out-Null

$files = @('index.html','version.json','styles.css','manifest.webmanifest','sw.js','icon.svg','icon.ico','icon-192.png','icon-512.png','launcher.ps1','desinstalar.ps1','README.md','FUNCIONALIDADES.md','RELEASE_NOTES.md','QUALITY_REPORT.md','LICENSE')
foreach ($file in $files) { if (Test-Path (Join-Path $source $file)) { Copy-Item (Join-Path $source $file) (Join-Path $target $file) -Force } }
Copy-Item (Join-Path $source 'js\core.js') (Join-Path $target 'js\core.js') -Force
Copy-Item (Join-Path $source 'js\app.js') (Join-Path $target 'js\app.js') -Force

$wsh = New-Object -ComObject WScript.Shell
function New-UniPlanShortcut($path, $description) {
  $shortcut = $wsh.CreateShortcut($path)
  $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$target\launcher.ps1`""
  $shortcut.WorkingDirectory = $target
  $shortcut.IconLocation = "$target\icon.ico,0"
  $shortcut.Description = $description
  $shortcut.Save()
}
New-UniPlanShortcut (Join-Path $desktop 'UniPlan.lnk') 'UniPlan 3.0 — Planeador Universitário'
New-UniPlanShortcut (Join-Path $startMenu 'UniPlan.lnk') 'UniPlan 3.0 — Planeador Universitário'

$uninstallShortcut = $wsh.CreateShortcut((Join-Path $startMenu 'Desinstalar UniPlan.lnk'))
$uninstallShortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$uninstallShortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$target\desinstalar.ps1`""
$uninstallShortcut.IconLocation = "$target\icon.ico,0"
$uninstallShortcut.Save()

$regPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\UniPlan'
New-Item -Path $regPath -Force | Out-Null
New-ItemProperty -Path $regPath -Name DisplayName -Value 'UniPlan 3.0' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $regPath -Name DisplayVersion -Value '3.0.0' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $regPath -Name Publisher -Value 'Raul Sousa' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $regPath -Name DisplayIcon -Value "$target\icon.ico" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $regPath -Name InstallLocation -Value $target -PropertyType String -Force | Out-Null
New-ItemProperty -Path $regPath -Name UninstallString -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$target\desinstalar.ps1`"" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $regPath -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $regPath -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null

Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList '-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',"$target\launcher.ps1" | Out-Null
Write-Host ''
Write-Host 'UniPlan instalado com sucesso.' -ForegroundColor Green
Write-Host 'Foi criado um atalho no Ambiente de Trabalho e no menu Iniciar.'
Write-Host 'As atualizacoes podem ser instaladas executando novamente INSTALAR_UNIPLAN.bat.'
