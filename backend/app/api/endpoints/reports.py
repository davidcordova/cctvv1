from datetime import datetime, timezone
from typing import Any, List, Dict
from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from app.db.session import get_session
from app.models.models import Report, Device, Camera
from app.core.config import settings

router = APIRouter()

@router.get("/", response_model=List[Report])
def read_reports(
    session: Session = Depends(get_session),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    reports = session.exec(select(Report).order_by(Report.timestamp.desc()).offset(skip).limit(limit)).all()
    return reports

@router.get("/executive-summary")
def get_executive_summary(
    session: Session = Depends(get_session)
) -> Dict[str, Any]:
    devices = session.exec(select(Device)).all()
    cameras = session.exec(select(Camera)).all()
    reports = session.exec(select(Report).order_by(Report.timestamp.desc())).all()

    total_devices = len(devices)
    online_devices = len([d for d in devices if d.is_online])
    offline_devices = total_devices - online_devices
    device_avail_pct = round((online_devices / total_devices * 100), 1) if total_devices > 0 else 100.0

    total_cameras = len(cameras)
    active_cameras = len([c for c in cameras if c.is_active])
    inactive_cameras = total_cameras - active_cameras
    camera_health_pct = round((active_cameras / total_cameras * 100), 1) if total_cameras > 0 else 100.0

    overall_sla = round((device_avail_pct * 0.6 + camera_health_pct * 0.4), 1) if total_devices > 0 else 100.0

    critical_events = len([r for r in reports if r.severity == "error"])
    warning_events = len([r for r in reports if r.severity == "warning"])
    info_events = len([r for r in reports if r.severity == "info"])

    # Agrupar cámaras por grabador
    cams_by_device = {}
    for cam in cameras:
        cams_by_device.setdefault(cam.device_id, []).append(cam)

    devices_list = []
    for dev in devices:
        dev_cams = cams_by_device.get(dev.id, [])
        active_count = len([c for c in dev_cams if c.is_active])
        total_cams = len(dev_cams)
        
        # Determinar nivel de salud de este DVR
        if not dev.is_online:
            health_status = "critical"
        elif active_count < total_cams:
            health_status = "warning"
        else:
            health_status = "optimal"

        devices_list.append({
            "id": dev.id,
            "name": dev.name,
            "host": dev.host,
            "port": dev.port,
            "brand": dev.brand,
            "device_type": dev.device_type,
            "channel_count": dev.channel_count or 8,
            "serial_number": dev.serial_number or "N/A",
            "is_online": dev.is_online,
            "health_status": health_status,
            "total_cameras": total_cams,
            "active_cameras": active_count,
            "cameras": [
                {
                    "id": c.id,
                    "name": c.name,
                    "channel": c.channel,
                    "is_active": c.is_active,
                    "has_rtsp": bool(c.rtsp_url)
                }
                for c in sorted(dev_cams, key=lambda x: x.channel)
            ]
        })

    recent_incidents = [
        {
            "id": r.id,
            "timestamp": r.timestamp.isoformat(),
            "event_type": r.event_type,
            "description": r.description,
            "severity": r.severity
        }
        for r in reports if r.severity in ("error", "warning")
    ][:10]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project_name": settings.PROJECT_NAME,
        "kpis": {
            "overall_sla": overall_sla,
            "total_devices": total_devices,
            "online_devices": online_devices,
            "offline_devices": offline_devices,
            "device_availability_pct": device_avail_pct,
            "total_cameras": total_cameras,
            "active_cameras": active_cameras,
            "inactive_cameras": inactive_cameras,
            "camera_health_pct": camera_health_pct,
            "total_events": len(reports),
            "critical_events": critical_events,
            "warning_events": warning_events,
            "info_events": info_events
        },
        "devices": devices_list,
        "recent_incidents": recent_incidents
    }

