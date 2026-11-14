; Script de Inno Setup para Sistema de Gestión CCTV
; Requiere Inno Setup 6 (https://jrsoftware.org/isinfo.php)

#define MyAppName "Sistema de Gestión CCTV"
#define MyAppVersion "2.1.2"
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
OutputBaseFilename=CCTV_System_Setup_v2.1.2
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
CloseApplications=no
RestartApplications=no
UninstallDisplayIcon={app}\{#MyAppExeName}
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

[UninstallDelete]
Type: filesandordirs; Name: "{app}\_internal"
Type: filesandordirs; Name: "{app}\static"
Type: files; Name: "{app}\go2rtc.log"
Type: files; Name: "{app}\go2rtc.yaml"

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
const
  APP_UNINSTALL_KEY = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{C8E12F5A-4B2D-4F12-89A0-213123456789}_is1';

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

  { Dar margen para que SQLite cierre handles WAL/SHM y el kernel libere ejecutables }
  Sleep(1200);
end;

function QueryUninstallInfo(const RootKey: Integer; var PrevAppDir, UninstExe: String): Boolean;
var
  S: String;
begin
  Result := False;
  if not RegKeyExists(RootKey, APP_UNINSTALL_KEY) then
    Exit;

  PrevAppDir := '';
  if RegQueryStringValue(RootKey, APP_UNINSTALL_KEY, 'Inno Setup: App Path', S) and (Trim(S) <> '') then
    PrevAppDir := RemoveBackslashUnlessRoot(Trim(S))
  else if RegQueryStringValue(RootKey, APP_UNINSTALL_KEY, 'InstallLocation', S) and (Trim(S) <> '') then
    PrevAppDir := RemoveBackslashUnlessRoot(Trim(S));

  UninstExe := '';
  if RegQueryStringValue(RootKey, APP_UNINSTALL_KEY, 'UninstallString', S) and (Trim(S) <> '') then
    UninstExe := RemoveQuotes(Trim(S));

  if (PrevAppDir <> '') or FileExists(UninstExe) then
    Result := True;
end;

function DetectPreviousInstallation(const TargetDir: String; var PrevAppDir, UninstExe: String): Boolean;
begin
  Result := QueryUninstallInfo(HKLM, PrevAppDir, UninstExe);
  if not Result then
    Result := QueryUninstallInfo(HKCU, PrevAppDir, UninstExe);
  if (not Result) and IsWin64 then
    Result := QueryUninstallInfo(HKLM64, PrevAppDir, UninstExe);

  if (PrevAppDir = '') and (UninstExe <> '') then
    PrevAppDir := RemoveBackslashUnlessRoot(ExtractFileDir(UninstExe));

  if (not Result) and (FileExists(TargetDir + '\unins000.exe') or FileExists(TargetDir + '\cctv_backend.exe')) then
  begin
    PrevAppDir := TargetDir;
    if FileExists(TargetDir + '\unins000.exe') then
      UninstExe := TargetDir + '\unins000.exe';
    Result := True;
  end;

  if (UninstExe <> '') and (not FileExists(UninstExe)) and (PrevAppDir <> '') and FileExists(PrevAppDir + '\unins000.exe') then
    UninstExe := PrevAppDir + '\unins000.exe';
end;

procedure MoveDirSafe(const SrcDir, DstDir: String);
var
  ResultCode: Integer;
begin
  if not DirExists(SrcDir) then
    Exit;

  ForceDirectories(ExtractFileDir(DstDir));
  if DirExists(DstDir) then
    DelTree(DstDir, True, True, True);

  Exec(ExpandConstant('{cmd}'),
    '/c move /Y "' + SrcDir + '" "' + DstDir + '" >nul 2>&1',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  if DirExists(SrcDir) then
  begin
    ForceDirectories(DstDir);
    Exec('robocopy.exe',
      '"' + SrcDir + '" "' + DstDir + '" /E /MOVE /R:2 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    DelTree(SrcDir, True, True, True);
  end;
end;

function CopyDataFiles(const FromDir, ToDir: String; const SaveRollingCopy: Boolean; const BackupRoot: String): Boolean;
var
  I: Integer;
  Files: array[0..9] of String;
  SrcPath, DstPath: String;
begin
  Result := False;
  if (FromDir = '') or (not DirExists(FromDir)) then
    Exit;

  Files[0] := 'sql_app.db';
  Files[1] := 'sql_app.db-wal';
  Files[2] := 'sql_app.db-shm';
  Files[3] := 'sql_app.db-journal';
  Files[4] := 'cctv.db';
  Files[5] := 'cctv.db-wal';
  Files[6] := 'cctv.db-shm';
  Files[7] := 'cctv.db-journal';
  Files[8] := '.env';
  Files[9] := 'ezviz_session.json';

  ForceDirectories(ToDir);
  for I := 0 to 9 do
  begin
    SrcPath := FromDir + '\' + Files[I];
    DstPath := ToDir + '\' + Files[I];
    if FileExists(SrcPath) then
    begin
      if CopyFile(SrcPath, DstPath, False) then
        Result := True;
    end;
  end;

  if SaveRollingCopy and FileExists(FromDir + '\sql_app.db') then
    CopyFile(FromDir + '\sql_app.db', BackupRoot + '\sql_app.pre_upgrade.db', False);
end;

procedure BackupUserData(const SrcDir, BackupDir, StageDir: String);
begin
  if (SrcDir = '') or (not DirExists(SrcDir)) then
    Exit;

  DelTree(StageDir, True, True, True);
  ForceDirectories(StageDir);

  CopyDataFiles(SrcDir, StageDir, True, BackupDir);

  { Mover storage (reportes/evidencias) fuera antes del desinstalador previo }
  if DirExists(SrcDir + '\storage') then
    MoveDirSafe(SrcDir + '\storage', StageDir + '\storage_staging');
end;

procedure RestoreUserData(const StageDir, DstDir: String);
begin
  if not DirExists(StageDir) then
    Exit;

  ForceDirectories(DstDir);
  CopyDataFiles(StageDir, DstDir, False, StageDir);

  if DirExists(StageDir + '\storage_staging') then
    MoveDirSafe(StageDir + '\storage_staging', DstDir + '\storage');

  DelTree(StageDir, True, True, True);
end;

procedure PurgeProgramFilesOnly(const DirPath: String);
var
  ResultCode: Integer;
begin
  if (DirPath = '') or (not DirExists(DirPath)) then
    Exit;

  if DirExists(DirPath + '\_internal') then
    DelTree(DirPath + '\_internal', True, True, True);
  if DirExists(DirPath + '\static') then
    DelTree(DirPath + '\static', True, True, True);

  Exec(ExpandConstant('{cmd}'),
    '/c for %x in (exe dll pyd bat) do @if exist "' + DirPath + '\*.%x" del /F /Q "' + DirPath + '\*.%x" >nul 2>&1',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  DeleteFile(DirPath + '\unins000.dat');
  DeleteFile(DirPath + '\unins000.msg');
  DeleteFile(DirPath + '\go2rtc.log');
  DeleteFile(DirPath + '\go2rtc.yaml');
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  TargetDir, PrevAppDir, UninstExe, DataSrcDir: String;
  BackupDir, StageDir: String;
  ResultCode: Integer;
begin
  TargetDir := RemoveBackslashUnlessRoot(WizardDirValue);

  if DetectPreviousInstallation(TargetDir, PrevAppDir, UninstExe) then
  begin
    if WizardForm <> nil then
      WizardForm.PreparingLabel.Caption := 'Desinstalando versión previa y preservando datos de dispositivos...';

    { 1. Detener todos los procesos y servicios activos para liberar SQLite y ejecutables }
    StopRunningCCTVProcesses();

    { 2. Respaldar BD, credenciales locales y evidencias fuera de la carpeta de programa }
    BackupDir := ExpandConstant('{commonappdata}\Sistema_CCTV_Backup');
    StageDir := BackupDir + '\current';
    DataSrcDir := PrevAppDir;
    if (DataSrcDir = '') or (not FileExists(DataSrcDir + '\sql_app.db') and not DirExists(DataSrcDir + '\storage')) then
    begin
      if FileExists(TargetDir + '\sql_app.db') or DirExists(TargetDir + '\storage') then
        DataSrcDir := TargetDir;
    end;
    BackupUserData(DataSrcDir, BackupDir, StageDir);

    { 3. Ejecutar el desinstalador previo en modo sincrono (_?=) antes de copiar archivos nuevos }
    if (UninstExe <> '') and FileExists(UninstExe) then
    begin
      if PrevAppDir <> '' then
        Exec(UninstExe, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART _?=' + PrevAppDir, '', SW_HIDE, ewWaitUntilTerminated, ResultCode)
      else
        Exec(UninstExe, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Sleep(500);
    end;

    { 4. Purgar binarios o restos de programa dejando intactos datos respaldados }
    PurgeProgramFilesOnly(PrevAppDir);
    if (PrevAppDir <> '') and (Uppercase(PrevAppDir) <> Uppercase(TargetDir)) then
    begin
      RemoveDir(PrevAppDir);
      PurgeProgramFilesOnly(TargetDir);
    end;

    { 5. Restaurar base de datos, sesiones y carpeta storage en la ruta de destino }
    RestoreUserData(StageDir, TargetDir);
  end
  else
  begin
    StopRunningCCTVProcesses();
  end;

  Result := '';
end;

function InitializeUninstall(): Boolean;
begin
  StopRunningCCTVProcesses();
  Result := True;
end;
