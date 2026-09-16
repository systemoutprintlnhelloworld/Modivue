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

[Files]
Source: "{#AppSource}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Modivue"; Filename: "{app}\Modivue.exe"
Name: "{autodesktop}\Modivue"; Filename: "{app}\Modivue.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Run]
Filename: "{app}\Modivue.exe"; Description: "Launch Modivue"; Flags: nowait postinstall skipifsilent
