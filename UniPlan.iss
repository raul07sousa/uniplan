#define MyAppName "UniPlan"
#define MyAppVersion "3.0.0"
#define MyAppPublisher "Raul Sousa"
[Setup]
AppId={{F2EE1B1C-2472-4B42-9B1B-4D8A12C30000}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\UniPlan
DefaultGroupName=UniPlan
OutputBaseFilename=UniPlan_Setup_v3_0_0
Compression=lzma
SolidCompression=yes
SetupIconFile=icon.ico
PrivilegesRequired=lowest
[Files]
Source: "index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "version.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "styles.css"; DestDir: "{app}"; Flags: ignoreversion
Source: "manifest.webmanifest"; DestDir: "{app}"; Flags: ignoreversion
Source: "sw.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "icon*"; DestDir: "{app}"; Flags: ignoreversion
Source: "launcher.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "desinstalar.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "js\*"; DestDir: "{app}\js"; Flags: ignoreversion recursesubdirs
[Icons]
Name: "{autodesktop}\UniPlan"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\launcher.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"
Name: "{group}\UniPlan"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\launcher.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"
[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\launcher.ps1"""; Description: "Abrir UniPlan"; Flags: postinstall nowait skipifsilent
