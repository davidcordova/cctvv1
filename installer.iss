; Script de Inno Setup para Sistema de Gestión CCTV
; Requiere Inno Setup 6 (https://jrsoftware.org/isinfo.php)

#define MyAppName "Sistema de Gestión CCTV"
#define MyAppVersion "2.1.1"
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
OutputBaseFilename=CCTV_System_Setup_v2.1.1
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
CloseApplications=no
RestartApplications=no
InfoAfterFile=credenciales_acceso.txt

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Messages]
spanish.FinishedHeadingLabel=Instalación de Sistema CCTV Completada
spanish.FinishedLabel=El Sistema CCTV se ha instalado correctamente en su equipo.%n%n----------------------------------------%nDATOS DE ACCESO:%n• Usuario: admin%n• Clave: admin%n• Dirección: http://localhost:8500%n----------------------------------------

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon"; Description: "Iniciar automáticamente al encender la PC"; GroupDescription: "Opciones de inicio:"; Flags: unchecked

[InstallDelete]
Type: filesandordirs; Name: "{app}\_internal"
Type: filesandordirs; Name: "{app}\static"

[Dirs]
Name: "{app}"
Name: "{app}\storage"

[Files]
Source: "dist\cctv_backend\*"; DestDir: "{app}"; Excludes: "go2rtc.yaml"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "dist\cctv_backend\go2rtc.yaml"; DestDir: "{app}"; Flags: onlyifdoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppLauncher}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\Iniciar Servidor Silencioso (Segundo Plano)"; Filename: "{app}\Iniciar_Servidor_Segundo_Plano.bat"; WorkingDir: "{app}"
Name: "{group}\Instalar Arranque Automatico con Windows"; Filename: "{app}\Instalar_Arranque_Automatico_Windows.bat"; WorkingDir: "{app}"
Name: "{group}\Detener CCTV"; Filename: "{app}\Detener_CCTV.bat"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppLauncher}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{commonstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppLauncher}"; WorkingDir: "{app}"; Tasks: startupicon

[Run]
Filename: "{cmd}"; Parameters: "/c icacls ""{app}"" /grant *S-1-5-32-545:(OI)(CI)M /C /Q >nul 2>&1 & if exist ""{app}\sql_app.db"" icacls ""{app}\sql_app.db"" /grant *S-1-5-32-545:M /C /Q >nul 2>&1 & if exist ""{app}\go2rtc.yaml"" icacls ""{app}\go2rtc.yaml"" /grant *S-1-5-32-545:M /C /Q >nul 2>&1 & if exist ""{app}\storage"" icacls ""{app}\storage"" /grant *S-1-5-32-545:(OI)(CI)M /C /Q >nul 2>&1"; StatusMsg: "Configurando permisos de carpeta..."; Flags: runhidden
Filename: "{cmd}"; Parameters: "/c call ""{app}\Configurar_Firewall_Windows.bat"" --silent"; WorkingDir: "{app}"; StatusMsg: "Configurando reglas de Firewall de Windows..."; Flags: runhidden
Filename: "{app}\{#MyAppLauncher}"; WorkingDir: "{app}"; Description: "Ejecutar {#MyAppName} ahora"; Flags: nowait shellexec postinstall skipifsilent

[Code]
procedure StopRunningCCTVProcesses();
var
  ResultCode: Integer;
begin
  { Detener servicios o tareas programadas previas si existieran }
  Exec('sc.exe', 'stop CCTV_Master_Service', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('sc.exe', 'stop SistemaCCTV', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('schtasks.exe', '/end /tn "SistemaCCTV_AutoStart"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  { Detener procesos en orden (backend padre primero, luego subprocesos de video) }
  Exec('taskkill.exe', '/F /IM cctv_backend.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM go2rtc.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM ffmpeg.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM mediamtx.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  { Liberar puertos 8500 y 1984 si quedaron sockets huerfanos }
  Exec(ExpandConstant('{cmd}'),
    '/c for /f "tokens=5" %a in (''netstat -aon ^| findstr ":8500 :1984" ^| findstr "LISTENING"'') do taskkill /F /T /PID %a >nul 2>&1',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  Sleep(1200);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopRunningCCTVProcesses();
  Result := '';
end;

function InitializeUninstall(): Boolean;
begin
  StopRunningCCTVProcesses();
  Result := True;
end;
