from typing import List, Any
from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from app.db.session import get_session
from app.models.models import Camera

router = APIRouter()

@router.get("/", response_model=List[Camera])
def read_cameras(
    session: Session = Depends(get_session),
    skip: int = 0,
    limit: int = 100
) -> Any:
    cameras = session.exec(select(Camera).offset(skip).limit(limit)).all()
    return cameras
import asyncio
import time
from fastapi import Response
from app.core.hikvision import HikvisionDriver
from app.models.models import Device

SNAPSHOT_CACHE = {} # {camera_id: (timestamp, image_data)}
IN_FLIGHT_SNAPSHOTS = {} # {camera_id: asyncio.Task}
MAX_CACHE_ENTRIES = 128

def _prune_snapshot_cache(now: float):
    if len(SNAPSHOT_CACHE) > MAX_CACHE_ENTRIES:
        stale_keys = [k for k, (ts, _) in SNAPSHOT_CACHE.items() if now - ts > 60.0]
        for k in stale_keys:
            del SNAPSHOT_CACHE[k]
        if len(SNAPSHOT_CACHE) > MAX_CACHE_ENTRIES:
            sorted_keys = sorted(SNAPSHOT_CACHE.keys(), key=lambda k: SNAPSHOT_CACHE[k][0])
            for k in sorted_keys[: len(SNAPSHOT_CACHE) - MAX_CACHE_ENTRIES]:
                del SNAPSHOT_CACHE[k]

async def _fetch_snapshot_worker(device: Device, channel: int, camera_id: int):
    driver = HikvisionDriver(device)
    image_data = await driver.get_snapshot(channel)
    SNAPSHOT_CACHE[camera_id] = (time.time(), image_data)
    return image_data

@router.get("/{camera_id}/snapshot")
async def get_camera_snapshot(
    camera_id: int,
    session: Session = Depends(get_session)
) -> Any:
    camera = session.get(Camera, camera_id)
    if not camera or not camera.is_active:
        return Response(status_code=404)
        
    device = session.get(Device, camera.device_id)
    if not device or not device.is_online:
        return Response(status_code=404)
        
    now = time.time()
    _prune_snapshot_cache(now)

    # 1. Si tenemos caché fresco (< 4.0s), devolver de inmediato
    if camera_id in SNAPSHOT_CACHE:
        cache_time, cached_data = SNAPSHOT_CACHE[camera_id]
        if now - cache_time < 4.0:
            return Response(content=cached_data, media_type="image/jpeg")
        
    # 2. Si ya hay una petición en curso para esta cámara, esperar la misma tarea (Deduplicación)
    if camera_id in IN_FLIGHT_SNAPSHOTS:
        try:
            image_data = await IN_FLIGHT_SNAPSHOTS[camera_id]
            return Response(content=image_data, media_type="image/jpeg")
        except Exception:
            pass

    # 3. Crear nueva tarea de obtención
    task = asyncio.create_task(_fetch_snapshot_worker(device, camera.channel, camera_id))
    IN_FLIGHT_SNAPSHOTS[camera_id] = task

    try:
        image_data = await task
        return Response(content=image_data, media_type="image/jpeg")
    except Exception as e:
        # Fallback a caché anterior si existe
        if camera_id in SNAPSHOT_CACHE:
            _, cached_data = SNAPSHOT_CACHE[camera_id]
            return Response(content=cached_data, media_type="image/jpeg")
        return Response(status_code=404)
    finally:
        IN_FLIGHT_SNAPSHOTS.pop(camera_id, None)




from app.schemas.camera import CameraUpdate
from fastapi import HTTPException

@router.put("/{camera_id}", response_model=Camera)
def update_camera(
    *,
    session: Session = Depends(get_session),
    camera_id: int,
    camera_in: CameraUpdate
) -> Any:
    camera = session.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    update_data = camera_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(camera, key, value)
        
    session.add(camera)
    session.commit()
    session.refresh(camera)
    
    # Sync WebRTC server config
    from app.core.go2rtc import sync_go2rtc_config
    sync_go2rtc_config()
    
    return camera


import httpx

@router.get("/webrtc-status")
async def get_webrtc_status():
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get("http://localhost:1984/api/streams", timeout=1.0)
            return {"available": res.status_code == 200}
    except Exception:
        return {"available": False}



