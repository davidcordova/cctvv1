@echo off
title Sistema CCTV - Detener
echo Deteniendo procesos del Sistema CCTV...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8500" ^| findstr "LISTENING"') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":1984" ^| findstr "LISTENING"') do taskkill /f /pid %%a 2>nul
taskkill /F /IM cctv_backend.exe /T 2>nul
taskkill /F /IM go2rtc.exe /T 2>nul
taskkill /F /IM python.exe /FI "WINDOWTITLE eq Sistema CCTV - Servidor*" 2>nul
echo Procesos finalizados con exito.
timeout /t 2 >nul
