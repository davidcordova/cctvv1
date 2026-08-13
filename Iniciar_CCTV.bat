@echo off
title Sistema CCTV - Servidor
echo Iniciando Sistema de Gestion CCTV...
if exist "dist\cctv_backend\cctv_backend.exe" (
    start "" "dist\cctv_backend\cctv_backend.exe"
) else (
    echo [INFO] No se ha encontrado la compilacion dist\cctv_backend\cctv_backend.exe.
    echo [INFO] Ejecutando entorno de desarrollo Python...
    call .venv\Scripts\activate.bat
    python backend/app/main.py
)
