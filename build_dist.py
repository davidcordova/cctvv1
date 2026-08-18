import os
import sys
import subprocess
import shutil

PROJECT_DIR = os.path.abspath(os.path.dirname(__file__))
FRONTEND_DIR = os.path.join(PROJECT_DIR, "frontend")
BACKEND_DIR = os.path.join(PROJECT_DIR, "backend")
DIST_DIR = os.path.join(PROJECT_DIR, "dist")
OUTPUT_DIR = os.path.join(DIST_DIR, "cctv_backend")

def log(msg):
    print(f"\n========================================\n[BUILD] {msg}\n========================================")

def run_cmd(cmd, cwd=None):
    print(f"> Running: {cmd} (in {cwd or os.getcwd()})")
    res = subprocess.run(cmd, shell=True, cwd=cwd)
    if res.returncode != 0:
        print(f"Error executing command: {cmd}")
        sys.exit(res.returncode)

def get_python_exe():
    venv_py1 = os.path.join(PROJECT_DIR, "backend", "venv", "Scripts", "python.exe")
    if os.path.exists(venv_py1):
        return venv_py1
    venv_py2 = os.path.join(PROJECT_DIR, ".venv", "Scripts", "python.exe")
    if os.path.exists(venv_py2):
        return venv_py2
    return sys.executable

def main():
    py_exe = get_python_exe()
    print(f"Utilizando interprete Python: {py_exe}")

    log("Step 1: Compilando Frontend React/Vite...")
    run_cmd("npm run build", cwd=FRONTEND_DIR)

    log("Step 2: Verificando/Instalando PyInstaller...")
    run_cmd(f'"{py_exe}" -m pip install pyinstaller', cwd=PROJECT_DIR)

    log("Step 3: Compilando Backend con PyInstaller...")
    spec_path = os.path.join(PROJECT_DIR, "cctv_backend.spec")
    run_cmd(f'"{py_exe}" -m PyInstaller --noconfirm "{spec_path}"', cwd=PROJECT_DIR)

    log("Step 4: Asegurando binarios externos (go2rtc.exe y go2rtc.yaml)...")
    go2rtc_src = os.path.join(BACKEND_DIR, "go2rtc.exe")
    go2rtc_dest = os.path.join(OUTPUT_DIR, "go2rtc.exe")
    if os.path.exists(go2rtc_src):
        shutil.copy2(go2rtc_src, go2rtc_dest)
        print("Copiado go2rtc.exe a la carpeta de distribución.")

    yaml_src = os.path.join(BACKEND_DIR, "go2rtc.yaml")
    yaml_dest = os.path.join(OUTPUT_DIR, "go2rtc.yaml")
    if os.path.exists(yaml_src):
        shutil.copy2(yaml_src, yaml_dest)
        print("Copiado go2rtc.yaml a la carpeta de distribución.")

    log("Step 5: Creando Lanzadores en Lote (Iniciar_CCTV.bat y Detener_CCTV.bat)...")
    iniciar_bat = os.path.join(OUTPUT_DIR, "Iniciar_CCTV.bat")
    with open(iniciar_bat, "w", encoding="utf-8") as f:
        f.write('@echo off\n')
        f.write('title Sistema CCTV - Servidor\n')
        f.write('cd /d "%~dp0"\n')
        f.write('echo ========================================================\n')
        f.write('echo         SISTEMA DE GESTION CCTV - INICIANDO\n')
        f.write('echo ========================================================\n')
        f.write('taskkill /F /IM cctv_backend.exe /T 2>nul\n')
        f.write('taskkill /F /IM go2rtc.exe /T 2>nul\n')
        f.write('echo Iniciando servidor backend y streaming...\n')
        f.write('start "" "%~dp0cctv_backend.exe"\n')

    detener_bat = os.path.join(OUTPUT_DIR, "Detener_CCTV.bat")
    with open(detener_bat, "w", encoding="utf-8") as f:
        f.write('@echo off\n')
        f.write('title Sistema CCTV - Detener\n')
        f.write('cd /d "%~dp0"\n')
        f.write('echo ========================================================\n')
        f.write('echo         SISTEMA DE GESTION CCTV - DETENIENDO\n')
        f.write('echo ========================================================\n')
        f.write('echo Deteniendo procesos del Sistema CCTV...\n')
        f.write('taskkill /F /IM cctv_backend.exe /T 2>nul\n')
        f.write('taskkill /F /IM go2rtc.exe /T 2>nul\n')
        f.write('echo Procesos finalizados con exito.\n')
        f.write('timeout /t 2 >nul\n')

    # Lanzador Silencioso (Headless - Sin Navegador)
    silencioso_bat = os.path.join(OUTPUT_DIR, "Iniciar_Servidor_Segundo_Plano.bat")
    with open(silencioso_bat, "w", encoding="utf-8") as f:
        f.write('@echo off\n')
        f.write('title Sistema CCTV - Modo Servidor Silencioso\n')
        f.write('cd /d "%~dp0"\n')
        f.write('echo ========================================================\n')
        f.write('echo     SISTEMA CCTV - MODO SERVIDOR DEDICADO\n')
        f.write('echo ========================================================\n')
        f.write('echo Iniciando en segundo plano (sin abrir navegador)...\n')
        f.write('taskkill /F /IM cctv_backend.exe /T 2>nul\n')
        f.write('taskkill /F /IM go2rtc.exe /T 2>nul\n')
        f.write('start "" "%~dp0cctv_backend.exe" --no-browser\n')
        f.write('echo Servidor activo. Los clientes pueden conectarse via web.\n')
        f.write('timeout /t 3 >nul\n')

    # Script para registrar arranque automático en Windows al encender la máquina
    autostart_bat = os.path.join(OUTPUT_DIR, "Instalar_Arranque_Automatico_Windows.bat")
    with open(autostart_bat, "w", encoding="utf-8") as f:
        f.write('@echo off\n')
        f.write('title Configurar Arranque Automatico CCTV con Windows\n')
        f.write('cd /d "%~dp0"\n')
        f.write('echo ========================================================\n')
        f.write('echo    CONFIGURAR INICIO AUTOMATICO (SERVICIO 24/7)\n')
        f.write('echo ========================================================\n')
        f.write('echo Registrando tarea del sistema para arrancar sin iniciar sesion...\n')
        f.write('schtasks /create /tn "SistemaCCTV_AutoStart" /tr "\\"%~dp0cctv_backend.exe\\" --no-browser" /sc onstart /ru SYSTEM /f\n')
        f.write('echo.\n')
        f.write('echo [OK] El Sistema CCTV ahora arrancara automaticamente con Windows\n')
        f.write('echo      sin necesidad de abrir sesión ni ventanas de navegador.\n')
        f.write('pause\n')

    remove_autostart_bat = os.path.join(OUTPUT_DIR, "Desinstalar_Arranque_Automatico.bat")
    with open(remove_autostart_bat, "w", encoding="utf-8") as f:
        f.write('@echo off\n')
        f.write('title Desinstalar Arranque Automatico CCTV\n')
        f.write('schtasks /delete /tn "SistemaCCTV_AutoStart" /f\n')
        f.write('echo [OK] Arranque automatico desinstalado.\n')
        f.write('pause\n')

    # También crear lanzadores en la raíz del dist
    shutil.copy2(iniciar_bat, os.path.join(DIST_DIR, "Iniciar_CCTV.bat"))
    shutil.copy2(detener_bat, os.path.join(DIST_DIR, "Detener_CCTV.bat"))
    shutil.copy2(silencioso_bat, os.path.join(DIST_DIR, "Iniciar_Servidor_Segundo_Plano.bat"))
    shutil.copy2(autostart_bat, os.path.join(DIST_DIR, "Instalar_Arranque_Automatico_Windows.bat"))
    shutil.copy2(remove_autostart_bat, os.path.join(DIST_DIR, "Desinstalar_Arranque_Automatico.bat"))

    log("Step 6: Buscando Inno Setup Compiler para generar el instalador .exe...")
    inno_paths = [
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"),
        r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        r"C:\Program Files\Inno Setup 6\ISCC.exe",
        r"C:\Program Files (x86)\Inno Setup 5\ISCC.exe",
    ]
    iscc_path = None
    for p in inno_paths:
        if os.path.exists(p):
            iscc_path = p
            break

    iss_file = os.path.join(PROJECT_DIR, "installer.iss")
    if iscc_path and os.path.exists(iss_file):
        print(f"Encontrado Inno Setup Compiler en: {iscc_path}")
        print("Compilando instalador de Windows...")
        run_cmd(f'"{iscc_path}" "{iss_file}"', cwd=PROJECT_DIR)
        print("Instalador generado exitosamente en carpeta output.")
    else:
        print("Inno Setup Compiler (ISCC.exe) no fue detectado en las rutas estándar.")
        print(f"La versión portable ejecutable fue empaquetada correctamente en:\n -> {OUTPUT_DIR}")
        print("Puedes distribuir la carpeta 'cctv_backend' o compilar manualmente 'installer.iss' si instalas Inno Setup.")

    log("Empaquetado completado exitosamente!")


if __name__ == "__main__":
    main()
