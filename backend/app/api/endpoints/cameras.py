from typing import List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select
from app.db.session import get_session, engine
from app.models.models import Camera, Device, User, UserRole, UserCameraLink
from app.core.security import get_current_user, require_operator_or_admin
import asyncio
import re
import time
import httpx
from app.core.hikvision import HikvisionDriver

router = APIRouter()


def _sanitize_camera_for_user(cam: Camera, is_admin: bool) -> Camera:
    """Oculta las credenciales RTSP en texto plano para usuarios no administradores manteniendo truthiness."""
    cam_copy = Camera(**cam.model_dump())
    if not is_admin and cam_copy.rtsp_url:
        cam_copy.rtsp_url = re.sub(r"rtsp://[^@]+@", "rtsp://***:***@", cam_copy.rtsp_url)
    return cam_copy


@router.get("/", response_model=List[Camera])
def read_cameras(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100
) -> Any:
    user_role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    is_admin = user_role_str == "admin"
    
    if user_role_str == "viewer":
        links = session.exec(select(UserCameraLink).where(UserCameraLink.user_id == current_user.id)).all()
        allowed_camera_ids = [l.camera_id for l in links]
        if not allowed_camera_ids:
            return []
        cameras = session.exec(
            select(Camera).where(Camera.id.in_(allowed_camera_ids)).offset(skip).limit(limit)
        ).all()
        return [_sanitize_camera_for_user(c, is_admin) for c in cameras]
        
    cameras = session.exec(select(Camera).offset(skip).limit(limit)).all()
    return [_sanitize_camera_for_user(c, is_admin) for c in cameras]

SNAPSHOT_CACHE = {} # {camera_id: (timestamp, image_data)}
IN_FLIGHT_SNAPSHOTS = {} # {camera_id: asyncio.Task}
MAX_CACHE_ENTRIES = 128
SNAPSHOT_SEMAPHORE = asyncio.Semaphore(16)

def _prune_snapshot_cache(now: float):
    if len(SNAPSHOT_CACHE) > MAX_CACHE_ENTRIES:
        stale_keys = [k for k, (ts, _) in SNAPSHOT_CACHE.items() if now - ts > 60.0]
        for k in stale_keys:
            del SNAPSHOT_CACHE[k]
        if len(SNAPSHOT_CACHE) > MAX_CACHE_ENTRIES:
            sorted_keys = sorted(SNAPSHOT_CACHE.keys(), key=lambda k: SNAPSHOT_CACHE[k][0])
            for k in sorted_keys[: len(SNAPSHOT_CACHE) - MAX_CACHE_ENTRIES]:
                del SNAPSHOT_CACHE[k]

from app.core.snapshots import capture_camera_snapshot

async def _fetch_snapshot_worker(device: Optional[Device], channel: int, camera_id: int, rtsp_url: Optional[str] = None):
    async with SNAPSHOT_SEMAPHORE:
        image_data = await capture_camera_snapshot(
            camera_id=camera_id,
            rtsp_url=rtsp_url,
            device=device,
            channel=channel
        )
        if image_data and len(image_data) > 1000:
            SNAPSHOT_CACHE[camera_id] = (time.time(), image_data)
            return image_data

        raise ValueError(f"No se pudo obtener snapshot para cámara {camera_id}")

@router.get("/{camera_id}/snapshot")
async def get_camera_snapshot(
    camera_id: int
) -> Any:
    # 1. Obtener cámara y dispositivo cerrando la sesión de BD de inmediato
    device_copy = None
    channel_num = 1
    rtsp_url = None
    with Session(engine) as session:
        camera = session.get(Camera, camera_id)
        if not camera or not camera.is_active:
            return Response(status_code=404)
        
        channel_num = camera.channel
        rtsp_url = camera.rtsp_url
        device = session.get(Device, camera.device_id)
        if device:
            device_copy = Device(**device.model_dump())
        
    now = time.time()
    _prune_snapshot_cache(now)

    # 1. Si tenemos caché fresco (< 3.0s), devolver de inmediato
    if camera_id in SNAPSHOT_CACHE:
        cache_time, cached_data = SNAPSHOT_CACHE[camera_id]
        if now - cache_time < 3.0:
            return Response(content=cached_data, media_type="image/jpeg")
        
    # 2. Si ya hay una petición en curso para esta cámara, esperar la misma tarea (Deduplicación)
    if camera_id in IN_FLIGHT_SNAPSHOTS:
        try:
            image_data = await IN_FLIGHT_SNAPSHOTS[camera_id]
            return Response(content=image_data, media_type="image/jpeg")
        except Exception:
            pass

    # 3. Crear nueva tarea de obtención
    task = asyncio.create_task(_fetch_snapshot_worker(device_copy, channel_num, camera_id, rtsp_url))
    IN_FLIGHT_SNAPSHOTS[camera_id] = task

    try:
        image_data = await task
        return Response(content=image_data, media_type="image/jpeg")
    except Exception:
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
    current_user: User = Depends(require_operator_or_admin),
    camera_id: int,
    camera_in: CameraUpdate
) -> Any:
    camera = session.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    update_data = camera_in.model_dump(exclude_unset=True)
    if "rtsp_url" in update_data and update_data["rtsp_url"] and "***:***" in update_data["rtsp_url"]:
        del update_data["rtsp_url"]

    for key, value in update_data.items():
        setattr(camera, key, value)
        
    session.add(camera)
    session.commit()
    session.refresh(camera)
    
    # Sync WebRTC MediaMTX server config
    from app.core.go2rtc import sync_go2rtc_config
    sync_go2rtc_config()
    
    user_role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    return _sanitize_camera_for_user(camera, user_role_str == "admin")


async def probe_rtsp_status(rtsp_url: str) -> dict:
    """Realiza una prueba rápida de handshake RTSP para determinar si responde 200 OK, 401 Unauthorized o timeout."""
    try:
        import urllib.parse
        parsed = urllib.parse.urlparse(rtsp_url)
        host = parsed.hostname
        port = parsed.port or 554
        if not host:
            return {"reachable": False, "error": "URL RTSP sin host válido"}

        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=2.0
        )
        clean_url = rtsp_url.split('#')[0]
        options_req = f"OPTIONS {clean_url} RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: CCTV-Master-Probe\r\n\r\n"
        writer.write(options_req.encode())
        await writer.drain()

        response_data = await asyncio.wait_for(reader.read(1024), timeout=2.0)
        writer.close()
        await writer.wait_closed()

        resp_str = response_data.decode(errors="ignore")
        if "401 Unauthorized" in resp_str:
            return {"reachable": True, "auth_error": True, "code": 401}
        elif "200 OK" in resp_str:
            return {"reachable": True, "auth_error": False, "code": 200}
        elif "404" in resp_str:
            return {"reachable": True, "not_found": True, "code": 404}
        else:
            return {"reachable": True, "auth_error": False, "code": 200, "raw": resp_str[:50]}
    except asyncio.TimeoutError:
        return {"reachable": False, "timeout": True, "error": "Tiempo de espera agotado al conectar al puerto RTSP 554"}
    except Exception as e:
        return {"reachable": False, "error": str(e)}


@router.get("/{camera_id}/diagnostic")
async def diagnose_camera(
    camera_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> dict:
    """Diagnóstico profundo del estado de una cámara para explicar con precisión por qué muestra o no video."""
    user_role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    if user_role_str == "viewer":
        link = session.exec(
            select(UserCameraLink).where(
                UserCameraLink.user_id == current_user.id,
                UserCameraLink.camera_id == camera_id
            )
        ).first()
        if not link:
            raise HTTPException(status_code=403, detail="No tiene permiso para diagnosticar esta cámara")

    camera = session.get(Camera, camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Cámara no encontrada")

    device = session.get(Device, camera.device_id) if camera.device_id else None

    # 1. ¿Cámara activa en sistema?
    if not camera.is_active:
        return {
            "camera_id": camera_id,
            "camera_name": camera.name,
            "status": "disabled",
            "is_online": False,
            "title": "Cámara Desactivada",
            "message": "Esta cámara está marcada como inactiva en la configuración del sistema.",
            "action_hint": "Habilitar cámara en la sección de dispositivos",
            "device_name": device.name if device else "Desconocido",
            "device_host": device.host if device else "N/A",
            "channel": camera.channel
        }

    # 2. ¿Tiene dispositivo asociado?
    if not device:
        return {
            "camera_id": camera_id,
            "camera_name": camera.name,
            "status": "unassigned",
            "is_online": False,
            "title": "Sin Grabador Asociado",
            "message": "La cámara no tiene un grabador o equipo asignado en la base de datos.",
            "action_hint": "Asignar grabador en Dispositivos",
            "channel": camera.channel
        }

    # 3. Sondeo de conectividad de red del Grabador / IP
    from app.main import check_connectivity
    is_device_reachable = await check_connectivity(device.host, device.port or 80)
    if not is_device_reachable:
        return {
            "camera_id": camera_id,
            "camera_name": camera.name,
            "status": "device_offline",
            "is_online": False,
            "title": "Grabador / Cámara Fuera de Línea",
            "message": f"El equipo '{device.name}' en la IP {device.host} no responde en la red local. Verifique que el dispositivo esté encendido y que el cable de red esté conectado.",
            "action_hint": "Verificar encendido y conexión IP del equipo",
            "device_name": device.name,
            "device_host": device.host,
            "channel": camera.channel
        }

    # 4. Probar credenciales y flujo RTSP
    if not camera.rtsp_url:
        return {
            "camera_id": camera_id,
            "camera_name": camera.name,
            "status": "no_rtsp",
            "is_online": False,
            "title": "URL RTSP No Configurada",
            "message": f"No se ha generado la URL RTSP para el canal {camera.channel} de {device.name}.",
            "action_hint": "Sincronizar canales en la sección Dispositivos",
            "device_name": device.name,
            "device_host": device.host,
            "channel": camera.channel
        }

    rtsp_res = await probe_rtsp_status(camera.rtsp_url)
    if rtsp_res.get("auth_error"):
        return {
            "camera_id": camera_id,
            "camera_name": camera.name,
            "status": "auth_failed",
            "is_online": False,
            "title": "Error de Autenticación",
            "message": f"El grabador {device.name} rechazó las credenciales (Error 401 Unauthorized). La contraseña o usuario son incorrectos.",
            "action_hint": "Actualizar usuario/contraseña en Dispositivos",
            "device_name": device.name,
            "device_host": device.host,
            "channel": camera.channel
        }

    if not rtsp_res.get("reachable"):
        return {
            "camera_id": camera_id,
            "camera_name": camera.name,
            "status": "rtsp_timeout",
            "is_online": False,
            "title": "Sin Flujo RTSP",
            "message": f"El puerto RTSP (554) del grabador {device.host} no responde o el canal {camera.channel} no tiene señal de video conectada.",
            "action_hint": "Verificar cámara física en el grabador o puerto 554",
            "device_name": device.name,
            "device_host": device.host,
            "channel": camera.channel
        }

    # 5. Probar estado del stream en go2rtc
    go2rtc_active = False
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            r = await client.get(f"http://localhost:1984/api/streams?src=camera_{camera_id}")
            if r.status_code == 200:
                stream_data = r.json()
                producers = stream_data.get(f"camera_{camera_id}", {}).get("producers", [])
                go2rtc_active = len(producers) > 0
    except Exception:
        pass

    # 6. Intentar captura de fotograma rápido multi-capa
    from app.core.snapshots import capture_camera_snapshot
    has_snapshot = False
    try:
        frame = await capture_camera_snapshot(camera_id, camera.rtsp_url, device, camera.channel)
        has_snapshot = bool(frame and len(frame) > 1000)
    except Exception:
        pass

    if has_snapshot or go2rtc_active:
        return {
            "camera_id": camera_id,
            "camera_name": camera.name,
            "status": "ok",
            "is_online": True,
            "title": "Cámara Operativa",
            "message": "La señal de video se transmite correctamente y el canal está en línea.",
            "action_hint": "Todo correcto",
            "device_name": device.name,
            "device_host": device.host,
            "channel": camera.channel,
            "webrtc_active": go2rtc_active
        }

    return {
        "camera_id": camera_id,
        "camera_name": camera.name,
        "status": "no_video",
        "is_online": False,
        "title": "Canal Sin Video (Pérdida de Señal)",
        "message": f"El grabador está en línea pero el canal {camera.channel} no entrega fotogramas. Verifique si la cámara está desconectada físicamente del puerto DVR.",
        "action_hint": "Revisar cableado físico o lente de la cámara",
        "device_name": device.name,
        "device_host": device.host,
        "channel": camera.channel
    }


@router.get("/webrtc-status")
async def get_webrtc_status():
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get("http://localhost:1984/api/streams", timeout=2.0)
            return {"available": res.status_code == 200}
    except Exception:
        # Fallback: check TCP port 1984
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection("127.0.0.1", 1984),
                timeout=1.5
            )
            writer.close()
            await writer.wait_closed()
            return {"available": True}
        except Exception:
            return {"available": False}


from fastapi import WebSocket, WebSocketDisconnect
from app.core.ezviz_talk import CameraAudioTalkBridge

@router.websocket("/{camera_id}/talk-ws")
async def camera_talk_websocket(websocket: WebSocket, camera_id: int):
    """
    Túnel de audio WebSocket bidireccional de ultra-baja latencia.
    Transmite los fragmentos de voz del micrófono en tiempo real hacia la cámara.
    """
    await websocket.accept()
    
    bridge = CameraAudioTalkBridge(camera_id)
    if not bridge.device:
        await websocket.send_json({"type": "error", "message": "Cámara o grabador no encontrado en la base de datos"})
        await websocket.close()
        return

    init_res = await bridge.start()
    if init_res.get("status") == "error":
        await websocket.send_json({"type": "error", "message": init_res.get("message", "Error al iniciar el puente de audio")})
        await websocket.close()
        return

    await websocket.send_json({
        "type": "ready",
        "message": init_res.get("message"),
        "is_ezviz": init_res.get("is_ezviz", False)
    })

    try:
        while True:
            data = await websocket.receive_bytes()
            if data:
                await bridge.push_chunk(data)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await bridge.stop()
