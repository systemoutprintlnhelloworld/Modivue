#ifndef AppSource
  #error AppSource is required
#endif
#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif

[Setup]
AppId={{B860B95E-0C56-4CA4-AE90-F9974C61616C}
AppName=Modivue
AppVersion={#AppVersion}
AppPublisher=Modivue
AppPublisherURL=https://github.com/systemoutprintlnhelloworld/Modivue
DefaultDirName={localappdata}\Programs\Modivue
DefaultGroupName=Modivue
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=Modivue-windows-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
UninstallDisplayIcon={app}\Modivue.exe
SetupIconFile=Modivue.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[CustomMessages]
english.ShortcutTasks=Shortcuts and background operation:
english.StartMenuTask=Add Modivue to the Start menu
english.DesktopTask=Create a desktop shortcut
english.StartupTask=Start Modivue when I sign in to Windows
english.InstallingWebView2=Installing Microsoft Edge WebView2 Runtime...
chinesesimplified.ShortcutTasks=快捷方式与常驻运行：
chinesesimplified.StartMenuTask=将 Modivue 添加到开始菜单
chinesesimplified.DesktopTask=创建桌面快捷方式
chinesesimplified.StartupTask=登录 Windows 时自动启动 Modivue
chinesesimplified.InstallingWebView2=正在安装 Microsoft Edge WebView2 Runtime...

[Files]
Source: "{#AppSource}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Modivue"; Filename: "{app}\Modivue.exe"; Tasks: startmenuicon
Name: "{autodesktop}\Modivue"; Filename: "{app}\Modivue.exe"; Tasks: desktopicon

[Tasks]
Name: "startmenuicon"; Description: "{cm:StartMenuTask}"; GroupDescription: "{cm:ShortcutTasks}"
Name: "desktopicon"; Description: "{cm:DesktopTask}"; GroupDescription: "{cm:ShortcutTasks}"; Flags: unchecked
Name: "startup"; Description: "{cm:StartupTask}"; GroupDescription: "{cm:ShortcutTasks}"; Flags: unchecked

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Modivue"; ValueData: """{app}\Modivue.exe"" --background"; Tasks: startup; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Modivue"; ValueType: none; Flags: uninsdeletekey dontcreatekey

[Run]
Filename: "{app}\resources\prerequisites\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "{cm:InstallingWebView2}"; Flags: runhidden waituntilterminated; Check: WebView2RuntimeMissing
Filename: "{app}\Modivue.exe"; Description: "Launch Modivue"; Flags: nowait postinstall skipifsilent

[Code]
function HasWebView2Version(RootKey: Integer): Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(RootKey,
    'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'pv', Version) and (Version <> '') and (CompareText(Version, '0.0.0.0') <> 0);
end;

function WebView2RuntimeMissing(): Boolean;
begin
  Result := not (HasWebView2Version(HKLM32) or HasWebView2Version(HKCU));
end;
