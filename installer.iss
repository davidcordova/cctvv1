; Script de Inno Setup para Sistema de Gestión CCTV
; Requiere Inno Setup 6 (https://jrsoftware.org/isinfo.php)

#define MyAppName "Sistema de Gestión CCTV"
#define MyAppVersion "1.1.0"
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
DisableProgramGroupPage=auto
OutputDir=Output
OutputBaseFilename=CCTV_System_Setup_v1.1.0
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
InfoAfterFile=credenciales_acceso.txt

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Messages]
spanish.FinishedHeadingLabel=Instalación de Sistema CCTV Completada
spanish.FinishedLabel=El Sistema CCTV se ha instalado correctamente en su equipo.%n%n----------------------------------------%nDATOS DE ACCESO:%n• Usuario: admin%n• Clave: admin%n• Dirección: http://localhost:8500%n----------------------------------------

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon"; Description: "Iniciar automáticamente al encender la PC"; GroupDescription: "Opciones de inicio:"; Flags: unchecked

[Dirs]
Name: "{app}"; Permissions: users-full

[Files]
Source: "dist\cctv_backend\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Permissions: users-full

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppLauncher}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\Detener CCTV"; Filename: "{app}\Detener_CCTV.bat"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppLauncher}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppLauncher}"; WorkingDir: "{app}"; Tasks: startupicon

[Run]
Filename: "{app}\{#MyAppLauncher}"; WorkingDir: "{app}"; Description: "Ejecutar {#MyAppName} ahora"; Flags: shellexec postinstall skipifsilent
