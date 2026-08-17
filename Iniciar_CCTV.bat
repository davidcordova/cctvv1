@echo off
title Sistema CCTV - Servidor
echo Iniciando Sistema de Gestion CCTV...
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
