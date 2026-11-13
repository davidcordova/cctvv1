import asyncio
import os
import subprocess
import httpx
from typing import Optional
from app.models.models import Device
from app.core.go2rtc import get_ffmpeg_path

def _run_ffmpeg_pipe(cmd: list, timeout: float = 3.5) -> Optional[bytes]:
    """Ejecuta FFmpeg en un hilo dedicado para extraer fotogramas JPEG sin bloquear el bucle de eventos."""
    try:
        # En Windows, ocultar ventana emergente de consola
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE

        res = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            startupinfo=startupinfo
        )
        if res.returncode == 0 and res.stdout and len(res.stdout) > 1000 and res.stdout.startswith(b'\xff\xd8'):
            return res.stdout
    except Exception:
        pass
    return None

async def capture_camera_snapshot(
    camera_id: int, 
    rtsp_url: Optional[str] = None, 
    device: Optional[Device] = None, 
    channel: int = 1
) -> Optional[bytes]:
    """
    Motor multi-capa de alta resiliencia para la captura instantánea de fotogramas (snapshots)
    tanto para el muro de cámaras como para los reportes ejecutivos.
    
    Capas de redundancia (priorizando memoria/HTTP sobre procesos FFmpeg):
    1. Tier 1: Endpoint de cuadros en tiempo real de go2rtc (/api/frame.jpeg).
    2. Tier 2: Captura por hardware directo vía HTTP ISAPI / CGI del grabador o cámara.
    3. Tier 3: Extracción directa por tubería FFmpeg desde el flujo local go2rtc (rtsp://127.0.0.1:8554/camera_{id}).
    4. Tier 4: Extracción directa por tubería FFmpeg conectándose al RTSP de origen de la cámara.
    """
    def _is_valid_jpeg(data: bytes) -> bool:
        return bool(data and len(data) > 1000 and data.startswith(b'\xff\xd8'))

    # Tier 1: go2rtc API frame (utiliza el búfer activo del stream sin sobrecarga DNS IPv6)
    try:
        async with httpx.AsyncClient(timeout=3.2) as client:
            res = await client.get(f"http://127.0.0.1:1984/api/frame.jpeg?src=camera_{camera_id}")
            if res.status_code == 200 and _is_valid_jpeg(res.content):
                return res.content
    except Exception:
        pass

    # Tier 2: Hardware ISAPI / CGI directo del grabador o cámara IP (~80-150ms con caché de endpoint)
    if device:
        try:
            from app.core.hikvision import HikvisionDriver
            driver = HikvisionDriver(device)
            img_data = await asyncio.wait_for(driver.get_snapshot(channel), timeout=2.2)
            if img_data and _is_valid_jpeg(img_data):
                return img_data
        except Exception:
            pass

    ffmpeg_bin = get_ffmpeg_path()

    # Tier 3: FFmpeg pipe directo desde el re-streamer local go2rtc (rtsp://127.0.0.1:8554)
    if ffmpeg_bin:
        cmd = [
            ffmpeg_bin, '-y',
            '-rtsp_transport', 'tcp',
            '-analyzeduration', '1000000',
            '-probesize', '1000000',
            '-i', f'rtsp://127.0.0.1:8554/camera_{camera_id}',
            '-vframes', '1',
            '-f', 'image2',
            '-q:v', '2',
            'pipe:1'
        ]
        data = await asyncio.to_thread(_run_ffmpeg_pipe, cmd, 3.0)
        if data:
            return data

    # Tier 4: FFmpeg directo a la URL RTSP de la cámara (fallback de última instancia)
    if ffmpeg_bin and rtsp_url:
        clean_rtsp = rtsp_url.split("#")[0]
        cmd = [
            ffmpeg_bin, '-y',
            '-rtsp_transport', 'tcp',
            '-analyzeduration', '1500000',
            '-probesize', '1500000',
            '-i', clean_rtsp,
            '-vframes', '1',
            '-f', 'image2',
            '-q:v', '2',
            'pipe:1'
        ]
        data = await asyncio.to_thread(_run_ffmpeg_pipe, cmd, 3.5)
        if data:
            return data

    return None
