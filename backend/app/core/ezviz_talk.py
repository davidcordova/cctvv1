"""
Módulo de Intercomunicador y Protocolos de Audio para Cámaras Ezviz y Estándar.
Gestiona la comunicación de voz bidireccional entre el navegador del usuario y
los altavoces de cámaras físicas (Ezviz, Dahua, Uniview, Hikvision).
"""
import os
import shutil
import asyncio
import urllib.parse
from typing import Optional
from sqlmodel import Session
from app.db.session import engine
from app.models.models import Camera, Device, Brand

class CameraAudioTalkBridge:
    def __init__(self, camera_id: int):
        self.camera_id = camera_id
        self.camera: Optional[Camera] = None
        self.device: Optional[Device] = None
        self.ffmpeg_proc: Optional[asyncio.subprocess.Process] = None
        self._load_metadata()

    def _load_metadata(self):
        with Session(engine) as session:
            cam = session.get(Camera, self.camera_id)
            if cam:
                self.camera = Camera(**cam.model_dump())
                if cam.device_id:
                    dev = session.get(Device, cam.device_id)
                    if dev:
                        self.device = Device(**dev.model_dump())

    @property
    def is_ezviz(self) -> bool:
        if not self.device:
            return False
        return "ezviz" in str(self.device.brand).lower() or "ezviz" in str(self.device.name).lower()

    async def start(self) -> dict:
        """Inicia el proceso de inyección de audio hacia el canal correspondiente."""
        if not self.device:
            return {"status": "error", "message": "Dispositivo o cámara no encontrados"}

        ffmpeg_bin = shutil.which("ffmpeg") or "ffmpeg"
        target_rtsp = f"rtsp://127.0.0.1:8554/camera_{self.camera_id}_talk"

        # Comando de codificación en tiempo real con ultra-baja latencia
        cmd = [
            ffmpeg_bin, "-y",
            "-f", "webm",
            "-i", "pipe:0",
            "-c:a", "pcm_mulaw",
            "-ar", "8000",
            "-ac", "1",
            "-f", "rtsp",
            "-rtsp_transport", "tcp",
            target_rtsp
        ]

        try:
            self.ffmpeg_proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL
            )
            
            vcode = getattr(self.device, "verification_code", None)
            msg = "Canal de voz activo"
            if self.is_ezviz:
                if vcode:
                    msg = f"Canal de voz activo con Código de Verificación ({vcode}). Transmitiendo audio..."
                else:
                    msg = "Canal de voz activo para cámara Ezviz. Transmitiendo paquetes..."
                
            return {
                "status": "ready", 
                "message": msg, 
                "is_ezviz": self.is_ezviz,
                "verification_code": vcode
            }
        except Exception as e:
            return {"status": "error", "message": f"Error iniciando proceso de audio: {str(e)}"}

    async def push_chunk(self, data: bytes):
        """Inyecta un fragmento binario de audio capturado por el micrófono."""
        if self.ffmpeg_proc and self.ffmpeg_proc.stdin:
            try:
                self.ffmpeg_proc.stdin.write(data)
                await self.ffmpeg_proc.stdin.drain()
            except Exception:
                pass

    async def stop(self):
        """Detiene y libera los recursos del puente de audio."""
        if self.ffmpeg_proc:
            try:
                if self.ffmpeg_proc.stdin:
                    self.ffmpeg_proc.stdin.close()
                self.ffmpeg_proc.terminate()
                await self.ffmpeg_proc.wait()
            except Exception:
                pass
            self.ffmpeg_proc = None
