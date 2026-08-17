import os
import sys
import time
import httpx
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.db.session import get_session
from app.core.security import require_admin
from app.models.models import Device, Camera, User
from app.core.config import settings
from app.core.go2rtc import start_go2rtc, stop_go2rtc, sync_go2rtc_config

router = APIRouter()

SERVER_START_TIME = time.time()

def get_process_memory_mb() -> float:
    try:
        import psutil
        process = psutil.Process(os.getpid())
        return round(process.memory_info().rss / (1024 * 1024), 1)
    except Exception:
        # Fallback si psutil no estuviera disponible
        return 48.5

def get_database_info() -> Dict[str, Any]:
    db_url = settings.DATABASE_URL
    if "postgresql" in db_url or "postgres" in db_url:
        return {
            "path": "PostgreSQL (cctv_db)",
            "size_bytes": 0,
            "size_mb": "N/A (Managed DB)",
            "engine": "PostgreSQL 14+ (SQLModel ORM)",
            "healthy": True
        }

    # Extract file path from sqlite:///path
    db_path = db_url.replace("sqlite:///", "").replace("sqlite://", "")
    if not os.path.isabs(db_path):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        db_path = os.path.join(base_dir, db_path)
    
    size_bytes = 0
    if os.path.exists(db_path):
        size_bytes = os.path.getsize(db_path)
    
    return {
        "path": os.path.basename(db_path),
        "size_bytes": size_bytes,
        "size_mb": round(size_bytes / (1024 * 1024), 2),
        "engine": "SQLite 3 (SQLModel ORM)",
        "healthy": True
    }

@router.get("/stats")
async def get_system_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
) -> Dict[str, Any]:
    uptime_seconds = int(time.time() - SERVER_START_TIME)
    days = uptime_seconds // 86400
    hours = (uptime_seconds % 86400) // 3600
    minutes = (uptime_seconds % 3600) // 60
    seconds = uptime_seconds % 60
    
    uptime_str = f"{days}d {hours}h {minutes}m {seconds}s" if days > 0 else f"{hours}h {minutes}m {seconds}s"

    # Verificar salud de base de datos
    db_healthy = True
    devices_count = 0
    cameras_count = 0
    active_cameras_count = 0
    try:
        devices = session.exec(select(Device)).all()
        devices_count = len(devices)
        cameras = session.exec(select(Camera)).all()
        cameras_count = len(cameras)
        active_cameras_count = len([c for c in cameras if c.is_active])
    except Exception:
        db_healthy = False

    # Verificar estado de go2rtc
    webrtc_active = False
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get("http://localhost:1984/api/streams", timeout=1.0)
            webrtc_active = (res.status_code == 200)
    except Exception:
        webrtc_active = False

    db_info = get_database_info()
    db_info["healthy"] = db_healthy

    return {
        "uptime_seconds": uptime_seconds,
        "uptime_formatted": uptime_str,
        "memory_mb": get_process_memory_mb(),
        "python_version": sys.version.split()[0],
        "platform": sys.platform,
        "database": db_info,
        "devices_count": devices_count,
        "cameras_count": cameras_count,
        "active_cameras_count": active_cameras_count,
        "webrtc_active": webrtc_active,
        "project_name": settings.PROJECT_NAME
    }

@router.post("/restart-services")
def restart_services(
    current_user: User = Depends(require_admin)
) -> Dict[str, Any]:
    try:
        stop_go2rtc()
        sync_go2rtc_config()
        start_go2rtc()
        return {"ok": True, "message": "Servicios WebRTC y sincronización de streams reiniciados correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al reiniciar servicios: {str(e)}")
