from typing import Any, List
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.db.session import get_session
from app.models.models import Device, Camera, Brand, Report, User
from app.schemas.device import DeviceCreate, DeviceUpdate, DeviceRead
from app.core.hikvision import HikvisionDriver, generate_rtsp_url, validate_device_credentials
from app.core.security import get_current_user, require_admin, require_operator_or_admin
from app.core import scanner

router = APIRouter()

@router.get("/scan")
def scan_network(
    current_user: User = Depends(require_admin)
):
    found_devices = scanner.scan_hikvision()
    return found_devices

@router.post("/test-connection")
async def test_device_connection(
    *,
    payload: dict,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
) -> Any:
    host = payload.get("host", "").strip()
    port = int(payload.get("port") or 80)
    username = payload.get("username", "admin").strip()
    password = payload.get("password", "")
    brand = payload.get("brand", "Hikvision")
    device_id = payload.get("device_id") or payload.get("id")

    if not password and device_id:
        existing = session.get(Device, device_id)
        if existing:
            password = existing.password

    if not host:
        raise HTTPException(status_code=400, detail="Debe ingresar una dirección IP / Host.")

    is_ok, msg = await validate_device_credentials(host, port, username, password, brand)
    return {"success": is_ok, "message": msg}

@router.get("/", response_model=List[DeviceRead])
def read_devices(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    devices = session.exec(select(Device).offset(skip).limit(limit)).all()
    return devices

@router.post("/", response_model=DeviceRead)
async def create_device(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
    device_in: DeviceCreate
) -> Any:
    # Validar conectividad y credenciales antes de adoptar
    is_ok, msg = await validate_device_credentials(
        device_in.host,
        device_in.port,
        device_in.username,
        device_in.password,
        device_in.brand
    )
    if not is_ok:
        raise HTTPException(status_code=400, detail=msg)

    device = Device.model_validate(device_in)
    device.is_online = True
    session.add(device)
    session.flush()


    report = Report(
        device_id=device.id,
        event_type="Adopción",
        description=f"Dispositivo {device.name} adoptado y registrado en el sistema.",
        severity="info"
    )
    session.add(report)
    session.commit()
    session.refresh(device)

    is_ipc = str(device.device_type).upper() == "IPC"
    default_count = 1 if is_ipc else 8
    count_to_create = device.channel_count if device.channel_count and device.channel_count > 0 else default_count
    channels_found = []

    # Intentar autodescubrimiento de hardware y canales
    try:
        driver = HikvisionDriver(device)
        hw = await driver.get_hardware_details()
        if hw.get("model"):
            device.model = hw["model"]
        if hw.get("serial_number"):
            device.serial_number = hw["serial_number"]
        if hw.get("firmware_version"):
            device.firmware_version = hw["firmware_version"]
        if hw.get("mac_address"):
            device.mac_address = hw["mac_address"]
        if hw.get("brand") and (device.brand == Brand.GENERIC or str(device.brand) == "Brand.GENERIC"):
            device.brand = hw["brand"]

        channels_found = await driver.get_channels()
        if channels_found and device.brand == Brand.GENERIC:
            device.brand = Brand.HIKVISION
        session.add(device)
    except Exception as e:
        print(f"Discovery error: {e}")

    if channels_found:
        for chan in channels_found:
            rtsp = generate_rtsp_url(device.host, device.username, device.password, chan['id'], device.brand)
            cam_name = f"{chan['name']} - {device.name}" if not is_ipc else device.name
            camera = Camera(
                name=cam_name,
                channel=chan['id'],
                device_id=device.id,
                rtsp_url=rtsp
            )
            session.add(camera)
    else:
        # Fallback usando el número de canales indicado por el usuario
        for i in range(1, count_to_create + 1):
            rtsp = generate_rtsp_url(device.host, device.username, device.password, i, device.brand)
            cam_name = device.name if count_to_create == 1 else f"Cámara {i} - {device.name}"
            camera = Camera(
                name=cam_name,
                channel=i,
                device_id=device.id,
                rtsp_url=rtsp
            )
            session.add(camera)

    session.commit()
    session.refresh(device)

    # Sync WebRTC server config sin bloquear el event loop
    from app.core.go2rtc import sync_go2rtc_config
    await asyncio.to_thread(sync_go2rtc_config)

    return device



@router.delete("/{device_id}")
def delete_device(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
    device_id: int
) -> Any:
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Delete associated reports to prevent Foreign Key Violation
    reports = session.exec(select(Report).where(Report.device_id == device_id)).all()
    for report in reports:
        session.delete(report)

    # Delete associated cameras and their user permission links
    cameras = session.exec(select(Camera).where(Camera.device_id == device_id)).all()
    camera_ids = [c.id for c in cameras if c.id is not None]
    if camera_ids:
        from app.models.models import UserCameraLink
        links = session.exec(select(UserCameraLink).where(UserCameraLink.camera_id.in_(camera_ids))).all()
        for link in links:
            session.delete(link)

    for camera in cameras:
        session.delete(camera)
        
    session.delete(device)
    session.commit()
    
    # Sync WebRTC server config
    from app.core.go2rtc import sync_go2rtc_config
    sync_go2rtc_config()
    
    return {"ok": True}


@router.put("/{device_id}", response_model=DeviceRead)
async def update_device(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
    device_id: int,
    device_in: DeviceUpdate
) -> Any:
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    old_name = device.name
    credentials_changed = any(
        getattr(device_in, key) is not None and getattr(device_in, key) != "" and getattr(device_in, key) != getattr(device, key)
        for key in ["host", "port", "username", "password", "brand"]
    )

    update_data = device_in.model_dump(exclude_unset=True)
    # No sobreescribir la contraseña con una cadena vacía si no se ingresó una nueva
    if "password" in update_data and (update_data["password"] is None or update_data["password"].strip() == ""):
        del update_data["password"]

    if credentials_changed:
        test_host = update_data.get("host", device.host)
        test_port = update_data.get("port", device.port)
        test_user = update_data.get("username", device.username)
        test_pwd = update_data.get("password", device.password)
        test_brand = update_data.get("brand", device.brand)
        is_ok, msg = await validate_device_credentials(test_host, test_port, test_user, test_pwd, test_brand)
        if not is_ok:
            raise HTTPException(status_code=400, detail=msg)

    for key, value in update_data.items():
        setattr(device, key, value)
        
    session.add(device)
    
    # If the device name is updated, rename all associated cameras to reflect the change
    if "name" in update_data and update_data["name"] != old_name:
        new_name = update_data["name"]
        cameras = session.exec(select(Camera).where(Camera.device_id == device_id)).all()
        for camera in cameras:
            if " - " in camera.name:
                parts = camera.name.split(" - ")
                parts[-1] = new_name
                camera.name = " - ".join(parts)
                session.add(camera)

    # Sincronizar cámaras del dispositivo según nuevo channel_count
    new_channel_count = device.channel_count or 1
    current_cameras = session.exec(select(Camera).where(Camera.device_id == device_id)).all()

    # 1. Si se redujo el número de canales, eliminar los canales sobrantes
    for cam in current_cameras:
        if cam.channel > new_channel_count:
            if cam.id is not None:
                from app.models.models import UserCameraLink
                links = session.exec(select(UserCameraLink).where(UserCameraLink.camera_id == cam.id)).all()
                for link in links:
                    session.delete(link)
            session.delete(cam)

    # 2. Si se incrementó el número de canales, crear los faltantes
    existing_channels = {c.channel for c in current_cameras if c.channel <= new_channel_count}
    for ch in range(1, new_channel_count + 1):
        if ch not in existing_channels:
            rtsp = generate_rtsp_url(device.host, device.username, device.password, ch, device.brand)
            new_cam = Camera(
                name=f"Cámara {ch} - {device.name}",
                channel=ch,
                device_id=device.id,
                rtsp_url=rtsp
            )
            session.add(new_cam)

    # 3. Si cambiaron credenciales o marca, refrescar RTSP URLs en las cámaras activas restantes
    if credentials_changed:
        remaining_cameras = session.exec(
            select(Camera).where(Camera.device_id == device_id, Camera.channel <= new_channel_count)
        ).all()
        for camera in remaining_cameras:
            camera.rtsp_url = generate_rtsp_url(
                host=device.host,
                username=device.username,
                password=device.password,
                channel_id=camera.channel,
                brand=device.brand
            )
            session.add(camera)
            
    session.commit()
    session.refresh(device)
    
    # Sync WebRTC server config sin bloquear el event loop
    from app.core.go2rtc import sync_go2rtc_config
    await asyncio.to_thread(sync_go2rtc_config)
    
    return device



@router.post("/{device_id}/reboot")
async def reboot_device(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
    device_id: int
) -> Any:
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.brand not in (Brand.HIKVISION, Brand.EZVIZ, Brand.DAHUA, Brand.HILOOK):
        raise HTTPException(status_code=400, detail="Reboot only supported for Hikvision/Ezviz/Dahua devices")
    
    try:
        driver = HikvisionDriver(device)
        success = await driver.reboot()
        if success:
            report = Report(
                device_id=device.id,
                event_type="Acción Remota",
                description=f"Se envió comando de reinicio al dispositivo {device.name}.",
                severity="warning"
            )
            session.add(report)
            session.commit()
            return {"ok": True, "message": f"Comando de reinicio enviado exitosamente al grabador {device.name}"}
        else:
            raise HTTPException(status_code=500, detail="El dispositivo rechazó el comando de reinicio o requiere permisos especiales")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al reiniciar: {str(e)}")


@router.post("/{device_id}/shutdown")
async def shutdown_device(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
    device_id: int
) -> Any:
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.brand not in (Brand.HIKVISION, Brand.EZVIZ, Brand.DAHUA, Brand.HILOOK):
        raise HTTPException(status_code=400, detail="Shutdown only supported for Hikvision/Ezviz/Dahua devices")
    
    try:
        driver = HikvisionDriver(device)
        success = await driver.shutdown()
        if success:
            report = Report(
                device_id=device.id,
                event_type="Acción Remota",
                description=f"Se envió comando de apagado al dispositivo {device.name}.",
                severity="warning"
            )
            session.add(report)
            session.commit()
            return {"ok": True, "message": f"Comando de apagado enviado al grabador {device.name}"}
        else:
            raise HTTPException(status_code=500, detail="El dispositivo rechazó el comando de apagado (algunos modelos no lo soportan por software)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al apagar: {str(e)}")


@router.post("/{device_id}/sync-time")
async def sync_device_time(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin),
    device_id: int
) -> Any:
    from datetime import datetime
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")
    
    driver = HikvisionDriver(device)
    sync_err = None
    try:
        await driver.sync_time()
    except Exception as e:
        sync_err = str(e)

    # Verificar siempre la hora real reportada por el hardware (ISAPI/CGI o cabecera RTSP Date)
    verification = await driver.get_device_time()
    now = datetime.now()

    if verification.get("device_time"):
        try:
            device.device_time = datetime.fromisoformat(verification["device_time"])
        except Exception:
            pass
        if verification.get("offset_seconds") is not None:
            device.time_offset_seconds = verification["offset_seconds"]

        device.time_synced_at = now
        session.add(device)

        source_label = "RTSP" if verification.get("source") == "RTSP" else "ISAPI/CGI"
        if sync_err and abs(device.time_offset_seconds or 0) > 300:
            session.commit()
            raise HTTPException(
                status_code=500,
                detail=f"El dispositivo reporta hora {device.device_time.strftime('%d/%m/%Y %H:%M:%S')} (desfase {round((device.time_offset_seconds or 0)/60)} min), pero rechazó el ajuste remoto HTTP ({sync_err})."
            )

        report = Report(
            device_id=device.id,
            event_type="Sincronización de Hora",
            description=f"Fecha y hora del dispositivo {device.name} verificada/sincronizada vía {source_label} ({device.device_time.strftime('%d/%m/%Y %H:%M:%S')}, desfase {device.time_offset_seconds}s).",
            severity="info"
        )
        session.add(report)
        session.commit()
        session.refresh(device)

        return {
            "ok": True,
            "message": f"Dispositivo '{device.name}' verificado ({source_label}): {device.device_time.strftime('%d/%m/%Y %H:%M:%S')} (desfase {device.time_offset_seconds}s)",
            "device": device
        }

    raise HTTPException(
        status_code=500,
        detail=f"No fue posible sincronizar ni verificar la hora de '{device.name}' ({device.host}). {sync_err or ''}".strip()
    )


@router.post("/sync-all-time")
async def sync_all_devices_time(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin),
) -> Any:
    from datetime import datetime
    try:
        dhcp_updated = await asyncio.to_thread(scanner.reconcile_dhcp_device_ips, session)
        if dhcp_updated > 0:
            from app.core.go2rtc import sync_go2rtc_config
            await asyncio.to_thread(sync_go2rtc_config)
    except Exception:
        pass

    devices = session.exec(select(Device)).all()
    now = datetime.now()

    async def _sync_single(dev: Device):
        if not dev.is_online:
            return {"id": dev.id, "name": dev.name, "status": "offline"}
        driver = HikvisionDriver(dev)
        write_ok = False
        write_err = None
        try:
            await asyncio.wait_for(driver.sync_time(), timeout=4.0)
            write_ok = True
        except Exception as e:
            write_err = str(e)

        try:
            verif = await asyncio.wait_for(driver.get_device_time(), timeout=3.5)
            if verif and verif.get("device_time"):
                return {
                    "id": dev.id,
                    "name": dev.name,
                    "status": "synced" if (write_ok or abs(verif.get("offset_seconds") or 0) <= 300) else "drifted",
                    "write_ok": write_ok,
                    "verif": verif,
                    "now": now
                }
        except Exception as e:
            write_err = str(e)

        return {"id": dev.id, "name": dev.name, "status": "error", "error": write_err or "Sin respuesta de reloj"}

    results = await asyncio.gather(*[_sync_single(d) for d in devices], return_exceptions=False)
    
    for r in results:
        if r.get("verif") and r["verif"].get("device_time"):
            dev_obj = session.get(Device, r["id"])
            if dev_obj:
                verif = r["verif"]
                try:
                    dev_obj.device_time = datetime.fromisoformat(verif["device_time"])
                except Exception:
                    pass
                if verif.get("offset_seconds") is not None:
                    dev_obj.time_offset_seconds = verif["offset_seconds"]
                dev_obj.time_synced_at = r["now"]
                session.add(dev_obj)

    session.commit()
    return {
        "ok": True,
        "message": f"Sincronización y verificación masiva de hora completada a las {now.strftime('%H:%M:%S')}",
        "results": results
    }


@router.post("/refresh-all")
async def refresh_all_devices(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin),
) -> Any:
    from app.core.hikvision import HikvisionDriver, set_last_telemetry_sync_ts
    from app.main import check_connectivity
    from datetime import datetime

    try:
        dhcp_updated = await asyncio.to_thread(scanner.reconcile_dhcp_device_ips, session)
        if dhcp_updated > 0:
            from app.core.go2rtc import sync_go2rtc_config
            await asyncio.to_thread(sync_go2rtc_config)
    except Exception:
        pass

    devices = session.exec(select(Device)).all()
    dev_snapshots = [Device(**d.model_dump()) for d in devices]

    async def _refresh_single(dev: Device):
        is_online = await check_connectivity(dev.host, dev.port)
        if not is_online:
            return {"id": dev.id, "is_online": False, "time_info": {}, "storage_info": {}, "channels_info": {}}
        try:
            driver = HikvisionDriver(dev)
            time_task = asyncio.wait_for(driver.get_device_time(), timeout=2.5)
            storage_task = asyncio.wait_for(driver.get_storage_status(), timeout=2.5)
            channels_task = asyncio.wait_for(driver.get_channels_status(), timeout=2.5)
            time_info, storage_info, channels_info = await asyncio.gather(
                time_task, storage_task, channels_task, return_exceptions=True
            )
            return {
                "id": dev.id,
                "is_online": True,
                "time_info": time_info if isinstance(time_info, dict) else {},
                "storage_info": storage_info if isinstance(storage_info, dict) else {},
                "channels_info": channels_info if isinstance(channels_info, dict) else {},
            }
        except Exception:
            return {"id": dev.id, "is_online": True, "time_info": {}, "storage_info": {}, "channels_info": {}}

    results = await asyncio.gather(*[_refresh_single(d) for d in dev_snapshots], return_exceptions=False)
    
    for r in results:
        if not r:
            continue
        dev_obj = session.get(Device, r["id"])
        if not dev_obj:
            continue
        dev_obj.is_online = r.get("is_online", dev_obj.is_online)
        time_info = r.get("time_info", {})
        storage_info = r.get("storage_info", {})
        channels_info = r.get("channels_info", {})

        if not dev_obj.is_online:
            dev_obj.hdd_status = "Sin Conexión al Grabador"
            if "IPC" in str(dev_obj.device_type).upper():
                dev_obj.hdd_capacity_total_gb = 0.0
                dev_obj.hdd_capacity_free_gb = 0.0
                dev_obj.storage_media_type = "Sin Almacenamiento Local"
        else:
            if time_info and time_info.get("device_time"):
                if time_info.get("offset_seconds") is not None:
                    dev_obj.time_offset_seconds = time_info["offset_seconds"]
                try:
                    dev_obj.device_time = datetime.fromisoformat(time_info["device_time"])
                except Exception:
                    pass

            if storage_info:
                dev_obj.hdd_status = storage_info.get("hdd_status", dev_obj.hdd_status)
                dev_obj.hdd_capacity_total_gb = storage_info.get("total_gb", dev_obj.hdd_capacity_total_gb)
                dev_obj.hdd_capacity_free_gb = storage_info.get("free_gb", dev_obj.hdd_capacity_free_gb)
                dev_obj.storage_media_type = storage_info.get("media_type", dev_obj.storage_media_type)

            if channels_info:
                dev_cams = session.exec(select(Camera).where(Camera.device_id == dev_obj.id)).all()
                cams_by_ch = {c.channel: c for c in dev_cams}
                for ch_num, ch_info in channels_info.items():
                    cam_obj = cams_by_ch.get(ch_num)
                    if not cam_obj:
                        continue
                    if ch_info.get("has_video_signal") is not None:
                        cam_obj.has_video_signal = bool(ch_info["has_video_signal"])
                    if ch_info.get("is_recording") is not None:
                        cam_obj.is_recording = bool(ch_info["is_recording"])
                    session.add(cam_obj)

        session.add(dev_obj)

    session.commit()
    set_last_telemetry_sync_ts()
    return {"ok": True, "message": "Dispositivos actualizados en tiempo real"}


@router.post("/{device_id}/sync-storage")
async def sync_device_storage(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin),
    device_id: int
) -> Any:
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    try:
        driver = HikvisionDriver(device)
        storage_info = await driver.get_storage_status()
        
        device.hdd_status = storage_info.get("hdd_status", device.hdd_status)
        device.hdd_capacity_total_gb = storage_info.get("total_gb", device.hdd_capacity_total_gb)
        device.hdd_capacity_free_gb = storage_info.get("free_gb", device.hdd_capacity_free_gb)
        device.storage_media_type = storage_info.get("media_type", device.storage_media_type)
        
        session.add(device)
        session.commit()
        session.refresh(device)
        
        return {
            "ok": True,
            "message": f"Almacenamiento de '{device.name}' verificado ({device.storage_media_type}): {storage_info.get('free_gb', 0)} GB libres de {storage_info.get('total_gb', 0)} GB",
            "storage": storage_info,
            "device": device
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al verificar almacenamiento: {str(e)}")


@router.post("/{device_id}/toggle-onvif")
async def toggle_device_onvif(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin),
    device_id: int,
    payload: dict = None
) -> Any:
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    new_state = payload.get("enabled") if payload and "enabled" in payload else not getattr(device, "onvif_enabled", False)
    
    try:
        driver = HikvisionDriver(device)
        success, message = await driver.set_onvif_status(new_state)
        
        device.onvif_enabled = new_state
        session.add(device)

        # Actualizar también las cámaras asociadas al dispositivo
        cameras = session.exec(select(Camera).where(Camera.device_id == device_id)).all()
        for cam in cameras:
            cam.onvif_enabled = new_state
            session.add(cam)

        state_text = "Habilitado" if new_state else "Deshabilitado"
        report = Report(
            device_id=device.id,
            event_type="Configuración ONVIF",
            description=f"Protocolo ONVIF {state_text} para el dispositivo {device.name} por {current_user.full_name or current_user.username}.",
            severity="info"
        )
        session.add(report)
        session.commit()
        session.refresh(device)

        # Refrescar configuración de streaming go2rtc sin bloquear el event loop
        from app.core.go2rtc import sync_go2rtc_config
        await asyncio.to_thread(sync_go2rtc_config)

        return {
            "ok": True,
            "onvif_enabled": new_state,
            "message": message,
            "device": device
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al cambiar estado ONVIF: {str(e)}")


@router.post("/{device_id}/sync-info")
async def sync_device_hardware_info(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin),
    device_id: int
) -> Any:
    """Consulta al hardware (ISAPI/CGI/SADP/ONVIF) y actualiza Marca, Modelo, Número de Serie, MAC y Firmware."""
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado")

    try:
        driver = HikvisionDriver(device)
        hw = await driver.get_hardware_details()

        if hw.get("model"):
            device.model = hw["model"]
        if hw.get("serial_number"):
            device.serial_number = hw["serial_number"]
        if hw.get("firmware_version"):
            device.firmware_version = hw["firmware_version"]
        if hw.get("mac_address"):
            device.mac_address = hw["mac_address"]
        if hw.get("brand") and (device.brand == Brand.GENERIC or str(device.brand) == "Brand.GENERIC"):
            device.brand = hw["brand"]

        device.is_online = True
        session.add(device)
        session.commit()
        session.refresh(device)

        msg_parts = []
        if device.model:
            msg_parts.append(f"Modelo: {device.model}")
        if device.serial_number:
            msg_parts.append(f"S/N: {device.serial_number}")
        if device.firmware_version:
            msg_parts.append(f"FW: {device.firmware_version}")
        if device.mac_address:
            msg_parts.append(f"MAC: {device.mac_address}")

        summary = " | ".join(msg_parts) if msg_parts else "Identificación obtenida"

        return {
            "ok": True,
            "message": f"Datos de '{device.name}' actualizados: {summary}",
            "hardware": hw,
            "device": device
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener datos del dispositivo: {str(e)}")


@router.post("/sync-all-info")
async def sync_all_devices_hardware_info(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin)
) -> Any:
    """Ejecuta un escaneo y sincronización masiva de datos (Marca, Modelo, Serie, MAC, Firmware) para todos los dispositivos en paralelo."""
    try:
        dhcp_updated = await asyncio.to_thread(scanner.reconcile_dhcp_device_ips, session)
        if dhcp_updated > 0:
            from app.core.go2rtc import sync_go2rtc_config
            await asyncio.to_thread(sync_go2rtc_config)
    except Exception:
        pass

    devices = session.exec(select(Device)).all()
    if not devices:
        return {"ok": True, "message": "No hay dispositivos registrados", "updated_count": 0, "results": []}

    # Escaneo de red en hilo separado para no bloquear el bucle de eventos de FastAPI
    network_map = {}
    try:
        scanned = await asyncio.to_thread(scanner.scan_network, 1.5)
        for s in scanned:
            network_map[s["host"]] = s
    except Exception as e:
        print(f"Error in scan_network batch: {e}")

    sem = asyncio.Semaphore(8)
    device_snapshots = [Device(**d.model_dump()) for d in devices]

    async def _probe_hw(dev_copy: Device):
        async with sem:
            try:
                driver = HikvisionDriver(dev_copy)
                hw = await asyncio.wait_for(driver.get_hardware_details(), timeout=5.0)
                return dev_copy.id, hw, None
            except Exception as ex:
                return dev_copy.id, None, str(ex)

    probed_list = await asyncio.gather(*[_probe_hw(d) for d in device_snapshots], return_exceptions=False)
    probed_by_id = {dev_id: (hw, err) for dev_id, hw, err in probed_list}

    results = []
    updated_count = 0

    for dev in devices:
        hw, err = probed_by_id.get(dev.id, (None, "No procesado"))
        if err or hw is None:
            results.append({
                "id": dev.id,
                "name": dev.name,
                "host": dev.host,
                "status": "error",
                "error": err or "Sin respuesta"
            })
            continue

        # Enriquecer con mapa de red si faltaba algo
        if dev.host in network_map:
            net_info = network_map[dev.host]
            if not hw.get("model") and net_info.get("model"):
                hw["model"] = net_info["model"]
            if not hw.get("serial_number") and net_info.get("serial"):
                hw["serial_number"] = net_info["serial"]
            if (not hw.get("brand") or hw.get("brand") == Brand.GENERIC) and net_info.get("brand"):
                hw["brand"] = net_info["brand"]

        changed = False
        if hw.get("model") and dev.model != hw["model"]:
            dev.model = hw["model"]
            changed = True
        if hw.get("serial_number") and dev.serial_number != hw["serial_number"]:
            dev.serial_number = hw["serial_number"]
            changed = True
        if hw.get("firmware_version") and dev.firmware_version != hw["firmware_version"]:
            dev.firmware_version = hw["firmware_version"]
            changed = True
        if hw.get("mac_address") and dev.mac_address != hw["mac_address"]:
            dev.mac_address = hw["mac_address"]
            changed = True
        if hw.get("brand") and dev.brand == Brand.GENERIC and hw["brand"] != Brand.GENERIC:
            dev.brand = hw["brand"]
            changed = True

        session.add(dev)
        if changed:
            updated_count += 1

        results.append({
            "id": dev.id,
            "name": dev.name,
            "host": dev.host,
            "brand": dev.brand,
            "model": dev.model,
            "serial_number": dev.serial_number,
            "firmware_version": dev.firmware_version,
            "mac_address": dev.mac_address,
            "status": "success"
        })

    session.commit()
    return {
        "ok": True,
        "message": f"Sincronización de hardware completada: {updated_count} dispositivos actualizados.",
        "updated_count": updated_count,
        "results": results
    }
