; Script de Inno Setup para Sistema de Gestión CCTV
; Requiere Inno Setup 6 (https://jrsoftware.org/isinfo.php)

#define MyAppName "Sistema de Gestión CCTV"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Empresa CCTV"
#define MyAppExeName "cctv_backend.exe"
#define MyAppLauncher "Iniciar_CCTV.bat"

[Setup]
AppId={{C8E12F5A-4B2D-4F12-89A0-213123456789}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Sistema CCTV
DefaultGroupName={#MyAppName}
AllowNoGroup=yes
OutputDir=Output
OutputBaseFilename=CCTV_System_Setup_v1.0
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon"; Description: "Iniciar automáticamente al encender la PC"; GroupDescription: "Opciones de inicio:"; Flags: unchecked

[Files]
Source: "dist\cctv_backend\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppLauncher}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\Detener CCTV"; Filename: "{app}\Detener_CCTV.bat"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppLauncher}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppLauncher}"; Tasks: startupicon

[Run]
Filename: "{app}\{#MyAppLauncher}"; Description: "Ejecutar {#MyAppName} ahora"; Flags: shellexec postinstall skipifsilent
