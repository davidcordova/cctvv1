@echo off
title Sistema CCTV - Servidor
echo Iniciando Sistema de Gestion CCTV...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8500" ^| findstr "LISTENING"') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":1984" ^| findstr "LISTENING"') do taskkill /f /pid %%a 2>nul
taskkill /F /IM cctv_backend.exe /T 2>nul
taskkill /F /IM go2rtc.exe /T 2>nul
if exist "dist\cctv_backend\cctv_backend.exe" (
    start "" "dist\cctv_backend\cctv_backend.exe"
) else (
    echo [INFO] No se ha encontrado la compilacion dist\cctv_backend\cctv_backend.exe.
    if exist "backend\venv\Scripts\activate.bat" (
        call backend\venv\Scripts\activate.bat
    ) else (
        call .venv\Scripts\activate.bat
    )
    python backend/app/main.py
)
