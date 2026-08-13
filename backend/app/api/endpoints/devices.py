from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.db.session import get_session
from app.models.models import Device, Camera, Brand, Report
from app.schemas.device import DeviceCreate, DeviceUpdate, DeviceRead
from app.core.hikvision import HikvisionDriver, generate_rtsp_url
from app.core import scanner

router = APIRouter()

@router.get("/scan")
def scan_network():
    found_devices = scanner.scan_hikvision()
    return found_devices

@router.get("/", response_model=List[DeviceRead])
def read_devices(
    session: Session = Depends(get_session),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    devices = session.exec(select(Device).offset(skip).limit(limit)).all()
    return devices

@router.post("/", response_model=DeviceRead)
async def create_device(
    *,
    session: Session = Depends(get_session),
    device_in: DeviceCreate
) -> Any:
    device = Device.model_validate(device_in)
    device.is_online = True # Set true on initial add to show it was successful
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

    count_to_create = device.channel_count if device.channel_count and device.channel_count > 0 else 8
    channels_found = []

    # Intentar autodescubrimiento ISAPI
    try:
        driver = HikvisionDriver(device)
        channels_found = await driver.get_channels()
        if channels_found and device.brand == Brand.GENERIC:
            device.brand = Brand.HIKVISION
            session.add(device)
    except Exception as e:
        print(f"Discovery error: {e}")

    if channels_found:
        for chan in channels_found:
            rtsp = generate_rtsp_url(device.host, device.username, device.password, chan['id'], device.brand)
            camera = Camera(
                name=f"{chan['name']} - {device.name}",
                channel=chan['id'],
                device_id=device.id,
                rtsp_url=rtsp
            )
            session.add(camera)
    else:
        # Fallback usando el número de canales indicado por el usuario
        for i in range(1, count_to_create + 1):
            rtsp = generate_rtsp_url(device.host, device.username, device.password, i, device.brand)
            camera = Camera(
                name=f"Cámara {i} - {device.name}",
                channel=i,
                device_id=device.id,
                rtsp_url=rtsp
            )
            session.add(camera)

    session.commit()
    session.refresh(device)

    # Sync WebRTC server config
    from app.core.go2rtc import sync_go2rtc_config
    sync_go2rtc_config()

    return device



@router.delete("/{device_id}")
def delete_device(
    *,
    session: Session = Depends(get_session),
    device_id: int
) -> Any:
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Delete associated reports to prevent Foreign Key Violation
    reports = session.exec(select(Report).where(Report.device_id == device_id)).all()
    for report in reports:
        session.delete(report)

    # Delete associated cameras
    cameras = session.exec(select(Camera).where(Camera.device_id == device_id)).all()
    for camera in cameras:
        session.delete(camera)
        
    session.delete(device)
    session.commit()
    
    # Sync WebRTC server config
    from app.core.go2rtc import sync_go2rtc_config
    sync_go2rtc_config()
    
    return {"ok": True}


@router.put("/{device_id}", response_model=DeviceRead)
def update_device(
    *,
    session: Session = Depends(get_session),
    device_id: int,
    device_in: DeviceUpdate
) -> Any:
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    old_name = device.name
    old_channel_count = device.channel_count or 8
    credentials_changed = any(
        getattr(device_in, key) is not None and getattr(device_in, key) != "" and getattr(device_in, key) != getattr(device, key)
        for key in ["host", "port", "username", "password", "brand"]
    )
    
    update_data = device_in.model_dump(exclude_unset=True)
    # No sobreescribir la contraseña con una cadena vacía si no se ingresó una nueva
    if "password" in update_data and (update_data["password"] is None or update_data["password"].strip() == ""):
        del update_data["password"]

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

    # If credentials or brand changed, update RTSP URLs correctly
    if credentials_changed:
        cameras = session.exec(select(Camera).where(Camera.device_id == device_id)).all()
        for camera in cameras:
            camera.rtsp_url = generate_rtsp_url(
                host=device.host,
                username=device.username,
                password=device.password,
                channel_id=camera.channel,
                brand=device.brand
            )
            session.add(camera)

    # If channel count increased, create missing cameras
    new_channel_count = device.channel_count or 8
    if new_channel_count > old_channel_count:
        existing_channels = {c.channel for c in session.exec(select(Camera).where(Camera.device_id == device_id)).all()}
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
            
    session.commit()
    session.refresh(device)
    
    # Sync WebRTC server config
    from app.core.go2rtc import sync_go2rtc_config
    sync_go2rtc_config()
    
    return device



@router.post("/{device_id}/reboot")
async def reboot_device(
    *,
    session: Session = Depends(get_session),
    device_id: int
) -> Any:
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.brand not in (Brand.HIKVISION, Brand.EZVIZ):
        raise HTTPException(status_code=400, detail="Reboot only supported for Hikvision/Ezviz devices")
    
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
            return {"ok": True, "message": "Comando de reinicio enviado con éxito"}
        else:
            raise HTTPException(status_code=500, detail="El dispositivo rechazó el comando de reinicio")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al reiniciar: {str(e)}")


@router.post("/{device_id}/shutdown")
async def shutdown_device(
    *,
    session: Session = Depends(get_session),
    device_id: int
) -> Any:
    device = session.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.brand not in (Brand.HIKVISION, Brand.EZVIZ):
        raise HTTPException(status_code=400, detail="Shutdown only supported for Hikvision/Ezviz devices")
    
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
            return {"ok": True, "message": "Comando de apagado enviado con éxito"}
        else:
            raise HTTPException(status_code=500, detail="El dispositivo rechazó el comando de apagado (algunos modelos no lo soportan por software)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al apagar: {str(e)}")
