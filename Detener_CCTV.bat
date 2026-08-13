@echo off
echo Deteniendo procesos del Sistema CCTV...
taskkill /F /IM cctv_backend.exe /T 2>nul
taskkill /F /IM go2rtc.exe /T 2>nul
taskkill /F /IM python.exe /FI "WINDOWTITLE eq Sistema CCTV - Servidor*" 2>nul
echo Procesos finalizados.
pause
