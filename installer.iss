; Script de Inno Setup para Sistema de Gestión CCTV
; Requiere Inno Setup 6 (https://jrsoftware.org/isinfo.php)

#define MyAppName "Sistema de Gestión CCTV"
#define MyAppVersion "1.7.2"
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
OutputBaseFilename=CCTV_System_Setup_v1.7.2
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
Name: "{group}\Iniciar Servidor Silencioso (Segundo Plano)"; Filename: "{app}\Iniciar_Servidor_Segundo_Plano.bat"; WorkingDir: "{app}"
Name: "{group}\Instalar Arranque Automatico con Windows"; Filename: "{app}\Instalar_Arranque_Automatico_Windows.bat"; WorkingDir: "{app}"
Name: "{group}\Detener CCTV"; Filename: "{app}\Detener_CCTV.bat"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppLauncher}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppLauncher}"; WorkingDir: "{app}"; Tasks: startupicon

[Run]
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - Web (8500)"" dir=in action=allow protocol=TCP localport=8500 profile=any"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - go2rtc WS (1984)"" dir=in action=allow protocol=TCP localport=1984 profile=any"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - go2rtc WebRTC (8555)"" dir=in action=allow protocol=TCP localport=8555 profile=any"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - go2rtc WebRTC UDP (8555)"" dir=in action=allow protocol=UDP localport=8555 profile=any"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - RTSP Server (8554)"" dir=in action=allow protocol=TCP localport=8554 profile=any"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - go2rtc Exe (Inbound)"" dir=in action=allow program=""{app}\go2rtc.exe"" enable=yes profile=any"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - go2rtc Exe (Outbound)"" dir=out action=allow program=""{app}\go2rtc.exe"" enable=yes profile=any"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - Backend Exe (Inbound)"" dir=in action=allow program=""{app}\cctv_backend.exe"" enable=yes profile=any"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - Backend Exe (Outbound)"" dir=out action=allow program=""{app}\cctv_backend.exe"" enable=yes profile=any"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - RTSP Cameras Outbound (554)"" dir=out action=allow protocol=TCP remoteport=554 profile=any"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - Dahua Outbound (37777)"" dir=out action=allow protocol=TCP remoteport=37777 profile=any"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - Dahua UDP Outbound (37778)"" dir=out action=allow protocol=UDP remoteport=37778 profile=any"; Flags: runhidden
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""Sistema CCTV - Hikvision SDK Outbound (8000)"" dir=out action=allow protocol=TCP remoteport=8000 profile=any"; Flags: runhidden
Filename: "{app}\{#MyAppLauncher}"; WorkingDir: "{app}"; Description: "Ejecutar {#MyAppName} ahora"; Flags: shellexec postinstall skipifsilent
