from datetime import datetime, timezone
from typing import Any, List, Dict, Optional
import os
import re
import time
import asyncio
import hashlib
import json
import httpx
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Body, Response
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlmodel import Session, select, col
from app.db.session import get_session
from app.models.models import Report, Device, Camera, User, AuditReport
from app.core.security import require_operator_or_admin, require_admin
from app.core.config import settings

router = APIRouter()

import sys

def get_storage_reports_dir() -> str:
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        test_file = os.path.join(exe_dir, ".test_write")
        is_writable = False
        try:
            with open(test_file, "w") as f:
                f.write("1")
            os.remove(test_file)
            is_writable = True
        except Exception:
            is_writable = False

        if is_writable:
            base_dir = exe_dir
        else:
            prog_data = os.environ.get("PROGRAMDATA") or os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or exe_dir
            base_dir = os.path.join(prog_data, "Sistema_CCTV")
        p = os.path.join(base_dir, "storage", "reports")
    else:
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
        p = os.path.join(root_dir, "storage", "reports")
    os.makedirs(p, exist_ok=True)
    return p

STORAGE_REPORTS_DIR = get_storage_reports_dir()

class UpdateAuditNotesRequest(BaseModel):
    notes: Optional[str] = None

class RejectAuditReportRequest(BaseModel):
    reason: str

from app.core.snapshots import capture_camera_snapshot

SNAPSHOT_CONCURRENCY = asyncio.Semaphore(12)

async def _capture_single_camera(report_dir: str, cam: Camera, device: Optional[Device]) -> tuple[int, bool]:
    """Captura y valida el fotograma para una cámara específica reutilizando caché reciente y pipeline multi-capa."""
    from app.api.endpoints.cameras import SNAPSHOT_CACHE

    file_path = os.path.join(report_dir, f"{cam.id}.jpg")
    
    # 1. Si ya existe un archivo válido congelado, verificar tamaño
    if os.path.exists(file_path) and os.path.getsize(file_path) > 1000:
        return cam.id, True

    # 2. Reutilizar caché RAM reciente (< 20s) para generación instantánea
    cached_entry = SNAPSHOT_CACHE.get(cam.id)
    if cached_entry:
        cache_ts, cached_bytes = cached_entry
        if (time.time() - cache_ts) < 20.0 and cached_bytes and len(cached_bytes) > 1000:
            try:
                with open(file_path, "wb") as f:
                    f.write(cached_bytes)
                return cam.id, True
            except Exception:
                pass

    async with SNAPSHOT_CONCURRENCY:
        img_data = await capture_camera_snapshot(
            camera_id=cam.id,
            rtsp_url=cam.rtsp_url,
            device=device,
            channel=cam.channel
        )
        if img_data and len(img_data) > 1000:
            SNAPSHOT_CACHE[cam.id] = (time.time(), img_data)
            try:
                with open(file_path, "wb") as f:
                    f.write(img_data)
                return cam.id, True
            except Exception:
                pass

    return cam.id, False


def _validate_report_code_dir(report_code: str) -> str:
    """Valida que report_code tenga formato seguro y previene ataques de Path Traversal."""
    clean_code = (report_code or "").strip()
    if not re.match(r"^[A-Za-z0-9_\-]+$", clean_code):
        raise HTTPException(status_code=400, detail="Código de informe inválido")
    base_abs = os.path.abspath(STORAGE_REPORTS_DIR)
    target_abs = os.path.abspath(os.path.join(base_abs, clean_code))
    if not target_abs.startswith(base_abs + os.sep):
        raise HTTPException(status_code=400, detail="Ruta de informe no permitida")
    return target_abs


async def _save_report_camera_snapshots(report_code: str, cameras_list: list, devices_dict: Optional[dict] = None) -> dict[int, bool]:
    """Guarda en disco las fotos de todas las cámaras en paralelo con verificación rigurosa."""
    report_dir = _validate_report_code_dir(report_code)
    os.makedirs(report_dir, exist_ok=True)
    devices_map = devices_dict or {}
    
    tasks = [
        _capture_single_camera(report_dir, cam, devices_map.get(cam.device_id))
        for cam in cameras_list
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    outcome = {}
    for r in results:
        if isinstance(r, tuple):
            cam_id, success = r
            outcome[cam_id] = success
    return outcome


@router.get("/{report_code}/snapshots/{camera_id}")
async def get_report_snapshot(
    report_code: str, 
    camera_id: int,
    session: Session = Depends(get_session)
):
    """Devuelve la captura fotográfica congelada en disco para el informe especificado (carga instantánea)."""
    report_dir = _validate_report_code_dir(report_code)
    file_path = os.path.join(report_dir, f"{camera_id}.jpg")
    
    if os.path.exists(file_path) and os.path.getsize(file_path) > 1000:
        return FileResponse(file_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable"})
        
    # Si aún no existe en disco, intentar capturar de inmediato
    cam = session.get(Camera, camera_id)
    device = session.get(Device, cam.device_id) if cam else None
    
    if cam:
        _, success = await _capture_single_camera(report_dir, cam, device)
        if success and os.path.exists(file_path) and os.path.getsize(file_path) > 1000:
            return FileResponse(file_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable"})
        
    # Fallback visual claro y honesto para auditoría si la cámara no tuvo señal
    cam_name = cam.name if cam else f"Cámara {camera_id}"
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225" fill="#09090b">
    <rect width="400" height="225" fill="#09090b" stroke="#27272a" stroke-width="2"/>
    <circle cx="200" cy="85" r="28" fill="#18181b" stroke="#e11d48" stroke-width="2"/>
    <line x1="185" y1="70" x2="215" y2="100" stroke="#e11d48" stroke-width="3" stroke-linecap="round"/>
    <line x1="215" y1="70" x2="185" y2="100" stroke="#e11d48" stroke-width="3" stroke-linecap="round"/>
    <text x="50%" y="140" dominant-baseline="middle" text-anchor="middle" fill="#f43f5e" font-family="sans-serif" font-size="13" font-weight="bold">SIN SEÑAL DE VIDEO</text>
    <text x="50%" y="165" dominant-baseline="middle" text-anchor="middle" fill="#71717a" font-family="sans-serif" font-size="11">Evidencia visual no disponible en grabador</text>
    <text x="50%" y="190" dominant-baseline="middle" text-anchor="middle" fill="#a1a1aa" font-family="sans-serif" font-size="10" font-weight="bold">{cam_name}</text>
    </svg>'''
    return Response(content=svg, media_type="image/svg+xml")

@router.get("/", response_model=List[Report])
def read_reports(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    reports = session.exec(select(Report).order_by(Report.timestamp.desc()).offset(skip).limit(limit)).all()
    return reports

@router.get("/history", response_model=List[AuditReport])
def get_audit_reports_history(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin),
    skip: int = 0,
    limit: int = 50,
) -> Any:
    """Devuelve la lista histórica de informes ejecutivos generados."""
    audit_reports = session.exec(
        select(AuditReport).order_by(AuditReport.id.desc()).offset(skip).limit(limit)
    ).all()
    return audit_reports

@router.get("/audit-reports")
def get_audit_reports_list(
    search: Optional[str] = None,
    status: Optional[str] = None, # 'all', 'pending', 'approved', 'rejected'
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin),
    skip: int = 0,
    limit: int = 50,
) -> Any:
    query = select(AuditReport).order_by(AuditReport.id.desc())
    count_query = select(func.count()).select_from(AuditReport)

    if status and status != 'all':
        query = query.where(AuditReport.status == status)
        count_query = count_query.where(AuditReport.status == status)

    if search:
        search_pattern = f"%{search}%"
        filter_cond = (
            (AuditReport.report_code.ilike(search_pattern)) |
            (AuditReport.generated_by.ilike(search_pattern)) |
            (AuditReport.notes.ilike(search_pattern))
        )
        query = query.where(filter_cond)
        count_query = count_query.where(filter_cond)

    total = session.exec(count_query).one()
    items = session.exec(query.offset(skip).limit(limit)).all()

    # Contadores rápidos agrupados en SQL sin cargar toda la tabla en memoria
    status_rows = session.exec(
        select(AuditReport.status, func.count()).group_by(AuditReport.status)
    ).all()
    counts_by_status = {row[0] or 'pending': row[1] for row in status_rows}
    pending_count = counts_by_status.get('pending', 0)
    approved_count = counts_by_status.get('approved', 0)
    rejected_count = counts_by_status.get('rejected', 0)
    all_count = sum(counts_by_status.values())

    return {
        "items": items,
        "reports": items,
        "total": total,
        "counters": {
            "all": all_count,
            "pending": pending_count,
            "approved": approved_count,
            "rejected": rejected_count
        },
        "stats": {
            "total": all_count,
            "pending": pending_count,
            "approved": approved_count,
            "rejected": rejected_count
        }
    }


def _build_signatures_dict(audit_entry: Optional[AuditReport]) -> dict:
    return {
        "technician": {
            "signed": bool(audit_entry.technician_signed) if audit_entry else False,
            "signed_by": audit_entry.technician_signed_by if audit_entry else None,
            "username": audit_entry.technician_username if audit_entry else None,
            "signed_at": audit_entry.technician_signed_at.isoformat() if audit_entry and audit_entry.technician_signed_at else None,
            "hash": audit_entry.technician_hash if audit_entry else None
        },
        "coordinator": {
            "signed": bool(audit_entry.coordinator_signed) if audit_entry else False,
            "signed_by": audit_entry.coordinator_signed_by if audit_entry else None,
            "username": audit_entry.coordinator_username if audit_entry else None,
            "signed_at": audit_entry.coordinator_signed_at.isoformat() if audit_entry and audit_entry.coordinator_signed_at else None,
            "hash": audit_entry.coordinator_hash if audit_entry else None
        }
    }


@router.get("/executive-summary")
async def get_executive_summary(
    report_code: Optional[str] = None,
    force_new: bool = False,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin)
):
    # 1. Resolver o generar correlativo oficial del informe
    today_str = datetime.now().strftime("%Y%m%d")
    code_prefix = f"INF-CCTV-{today_str}-"
    
    audit_entry = None

    if report_code:
        _validate_report_code_dir(report_code)
        audit_entry = session.exec(select(AuditReport).where(AuditReport.report_code == report_code)).first()

    if not audit_entry and not force_new:
        existing_for_today = session.exec(
            select(AuditReport).where(AuditReport.report_code.startswith(code_prefix)).order_by(AuditReport.id.desc())
        ).first()
        if existing_for_today:
            audit_entry = existing_for_today

    # Si el informe ya está firmado/aprobado/rechazado o es un informe histórico con snapshot congelado,
    # devolver el snapshot inmutable para preservar la integridad forense del sello SHA-256.
    if (
        audit_entry
        and not force_new
        and audit_entry.report_data_json
        and (
            audit_entry.technician_signed
            or audit_entry.coordinator_signed
            or audit_entry.status in ("approved", "rejected")
            or not audit_entry.report_code.startswith(code_prefix)
        )
    ):
        try:
            frozen_payload = json.loads(audit_entry.report_data_json)
            frozen_payload["status"] = audit_entry.status or "pending"
            frozen_payload["notes"] = audit_entry.notes
            frozen_payload["rejection_reason"] = audit_entry.rejection_reason
            frozen_payload["rejected_by"] = audit_entry.rejected_by
            frozen_payload["rejected_at"] = audit_entry.rejected_at.isoformat() if audit_entry.rejected_at else None
            frozen_payload["signatures"] = _build_signatures_dict(audit_entry)
            return frozen_payload
        except Exception:
            pass

    # Refrescar telemetría real (DHCP, conectividad, hora, disco y señal por canal) si está obsoleta (>= 60s) o es informe nuevo
    try:
        from app.core import scanner
        from app.core.hikvision import HikvisionDriver, get_last_telemetry_sync_ts, set_last_telemetry_sync_ts
        from app.main import check_connectivity

        telemetry_age = time.time() - get_last_telemetry_sync_ts()
        if force_new or telemetry_age >= 60.0:
            dhcp_updated = await asyncio.to_thread(scanner.reconcile_dhcp_device_ips, session)
            if dhcp_updated > 0:
                from app.core.go2rtc import sync_go2rtc_config
                await asyncio.to_thread(sync_go2rtc_config)

            live_devs = session.exec(select(Device)).all()
            dev_snaps = [Device(**d.model_dump()) for d in live_devs]

            async def _probe_live_dev(d_copy: Device):
                is_on = await check_connectivity(d_copy.host, d_copy.port)
                if not is_on:
                    return d_copy.id, False, None, None, None
                drv = HikvisionDriver(d_copy)
                t_res, s_res, ch_res = await asyncio.gather(
                    asyncio.wait_for(drv.get_device_time(), timeout=2.2),
                    asyncio.wait_for(drv.get_storage_status(), timeout=2.2),
                    asyncio.wait_for(drv.get_channels_status(), timeout=2.2),
                    return_exceptions=True
                )
                return (
                    d_copy.id,
                    True,
                    t_res if isinstance(t_res, dict) else None,
                    s_res if isinstance(s_res, dict) else None,
                    ch_res if isinstance(ch_res, dict) else None,
                )

            probed = await asyncio.gather(*[_probe_live_dev(d) for d in dev_snaps], return_exceptions=True)
            for item in probed:
                if not isinstance(item, tuple):
                    continue
                d_id, is_on, t_info, s_info, ch_info = item
                db_d = session.get(Device, d_id)
                if not db_d:
                    continue
                db_d.is_online = is_on
                if not is_on:
                    db_d.hdd_status = "Sin Conexión al Grabador"
                    if "IPC" in str(db_d.device_type).upper():
                        db_d.hdd_capacity_total_gb = 0.0
                        db_d.hdd_capacity_free_gb = 0.0
                        db_d.storage_media_type = "Sin Almacenamiento Local"
                else:
                    if t_info and t_info.get("device_time"):
                        try:
                            db_d.device_time = datetime.fromisoformat(t_info["device_time"])
                        except Exception:
                            pass
                        if t_info.get("offset_seconds") is not None:
                            db_d.time_offset_seconds = t_info["offset_seconds"]
                    if s_info:
                        db_d.hdd_status = s_info.get("hdd_status", db_d.hdd_status)
                        db_d.hdd_capacity_total_gb = s_info.get("total_gb", db_d.hdd_capacity_total_gb)
                        db_d.hdd_capacity_free_gb = s_info.get("free_gb", db_d.hdd_capacity_free_gb)
                        db_d.storage_media_type = s_info.get("media_type", db_d.storage_media_type)
                    if ch_info:
                        dev_cams = session.exec(select(Camera).where(Camera.device_id == db_d.id)).all()
                        cams_by_ch = {c.channel: c for c in dev_cams}
                        for ch_num, ch_data in ch_info.items():
                            cam_obj = cams_by_ch.get(ch_num)
                            if not cam_obj:
                                continue
                            if ch_data.get("has_video_signal") is not None:
                                cam_obj.has_video_signal = bool(ch_data["has_video_signal"])
                            if ch_data.get("is_recording") is not None:
                                cam_obj.is_recording = bool(ch_data["is_recording"])
                            session.add(cam_obj)
                session.add(db_d)
            session.commit()
            set_last_telemetry_sync_ts()
    except Exception:
        pass

    devices = session.exec(select(Device)).all()
    cameras = session.exec(select(Camera)).all()
    devices_dict = {d.id: d for d in devices}

    is_brand_new = False
    if not audit_entry:
        is_brand_new = True
        existing_count = session.exec(
            select(func.count()).select_from(AuditReport).where(AuditReport.report_code.startswith(code_prefix))
        ).one()
        seq_number = existing_count + 1
        new_report_code = f"INF-CCTV-{today_str}-{seq_number:04d}"
        pdf_filename = f"{new_report_code}_Informe_Ejecutivo_CCTV"
    else:
        new_report_code = audit_entry.report_code
        seq_number = int(new_report_code.split("-")[-1]) if "-" in new_report_code else 1
        pdf_filename = f"{new_report_code}_Informe_Ejecutivo_CCTV"

    # 2. PRIORIDAD MÁXIMA: Recolección y verificación paralela de capturas fotográficas
    installed_cams_objs = [c for c in cameras if getattr(c, 'is_installed', True)]
    capture_results = await _save_report_camera_snapshots(new_report_code, installed_cams_objs, devices_dict)

    # 3. Métricas objetivas de conectividad, almacenamiento y sincronización horaria por dispositivo
    total_devices = len(devices)
    online_devices = len([d for d in devices if d.is_online])
    offline_devices = total_devices - online_devices
    device_avail_pct = round((online_devices / total_devices * 100), 1) if total_devices > 0 else 100.0

    now_local = datetime.now()
    hdd_healthy_devices = 0
    hdd_unhealthy_devices = 0
    hdd_ok_by_dev: Dict[int, bool] = {}
    drifted_devices = []
    drifted_by_dev: Dict[int, bool] = {}

    for d in devices:
        status_lower = (d.hdd_status or "").lower()
        is_ipc = "IPC" in str(d.device_type).upper() or (d.channel_count or 1) <= 1
        if is_ipc:
            is_hdd_ok = d.is_online and any(
                w in status_lower for w in ("normal", "formato ok", "ok", "formatted", "centralizada")
            )
        else:
            is_hdd_ok = (
                d.is_online
                and (d.hdd_capacity_total_gb or 0) > 0
                and any(w in status_lower for w in ("normal", "formato ok", "ok", "formatted"))
            )
        hdd_ok_by_dev[d.id] = is_hdd_ok
        if is_hdd_ok:
            hdd_healthy_devices += 1
        else:
            hdd_unhealthy_devices += 1

        # Evaluación objetiva de desfase horario (> 5 minutos o fecha obsoleta/no disponible)
        is_dev_drifted = False
        if d.is_online:
            if d.device_time is None:
                is_dev_drifted = True
            else:
                dev_dt_naive = d.device_time.replace(tzinfo=None)
                real_diff = int((dev_dt_naive - now_local).total_seconds())
                d.time_offset_seconds = real_diff
                if abs(real_diff) > 300:
                    is_dev_drifted = True
        drifted_by_dev[d.id] = is_dev_drifted
        if is_dev_drifted:
            drifted_devices.append(d.id)

    drifted_count = len(drifted_devices)
    time_synced_online = max(0, online_devices - drifted_count)
    time_sync_pct = round((time_synced_online / online_devices * 100), 1) if online_devices > 0 else 0.0

    # Capacidad Total de Puertos vs Cámaras Físicas Instaladas
    total_ports = len(cameras)
    installed_cameras = len(installed_cams_objs)
    free_ports = total_ports - installed_cameras

    # Evaluación objetiva de cámaras en base a imagen verificada + señal física del grabador + estado de disco
    verified_cameras_count = 0
    active_cameras = 0
    recording_cameras = 0

    for c in installed_cams_objs:
        if getattr(c, "has_video_signal", True) is False:
            capture_results[c.id] = False
        has_verified_image = capture_results.get(c.id, False)
        parent_hdd_ok = hdd_ok_by_dev.get(c.device_id, False)
        if has_verified_image:
            verified_cameras_count += 1
            if c.is_active:
                active_cameras += 1
            if c.is_recording and c.is_active and parent_hdd_ok:
                recording_cameras += 1

    inactive_installed_cameras = installed_cameras - active_cameras
    not_recording_cameras = installed_cameras - recording_cameras
    camera_health_pct = round((active_cameras / installed_cameras * 100), 1) if installed_cameras > 0 else 100.0
    recording_compliance_pct = round((recording_cameras / installed_cameras * 100), 1) if installed_cameras > 0 else 100.0
    evidence_compliance_pct = round((verified_cameras_count / installed_cameras * 100), 1) if installed_cameras > 0 else 100.0

    # SLA Ponderado Real y Objetivo (Conectividad 25%, Grabación 30%, Evidencia 20%, Almacenamiento 15%, Sincronización Horaria 10%)
    hdd_pct = round((hdd_healthy_devices / total_devices * 100), 1) if total_devices > 0 else 100.0
    overall_sla = round(
        (
            device_avail_pct * 0.25
            + recording_compliance_pct * 0.30
            + evidence_compliance_pct * 0.20
            + hdd_pct * 0.15
            + time_sync_pct * 0.10
        ),
        1
    ) if total_devices > 0 else 100.0

    # Contadores de eventos optimizados por SQL
    severity_rows = session.exec(
        select(Report.severity, func.count()).group_by(Report.severity)
    ).all()
    severity_counts = {row[0]: row[1] for row in severity_rows}
    critical_events = severity_counts.get("error", 0)
    warning_events = severity_counts.get("warning", 0)
    info_events = severity_counts.get("info", 0)
    total_events = sum(severity_counts.values())

    recent_incident_objs = session.exec(
        select(Report)
        .where(Report.severity.in_(["error", "warning"]))
        .order_by(Report.timestamp.desc())
        .limit(10)
    ).all()

    # Agrupar cámaras por grabador con verificación estricta de señal
    cams_by_device = {}
    for cam in cameras:
        cams_by_device.setdefault(cam.device_id, []).append(cam)

    devices_list = []
    for dev in devices:
        dev_cams = cams_by_device.get(dev.id, [])
        dev_installed = len([c for c in dev_cams if getattr(c, 'is_installed', True)])
        dev_free = len(dev_cams) - dev_installed
        
        is_hdd_ok = hdd_ok_by_dev.get(dev.id, False)
        is_drifted = drifted_by_dev.get(dev.id, False)
        offset = dev.time_offset_seconds or 0
        hdd_status = dev.hdd_status or "Normal (Formato OK)"

        dev_active_count = len([c for c in dev_cams if getattr(c, 'is_installed', True) and capture_results.get(c.id, False) and c.is_active])
        dev_recording_count = len([c for c in dev_cams if getattr(c, 'is_installed', True) and capture_results.get(c.id, False) and c.is_recording and c.is_active and is_hdd_ok])
        total_cams = len(dev_cams)

        if not dev.is_online or not is_hdd_ok:
            health_status = "critical"
        elif dev_active_count < dev_installed or dev_recording_count < dev_installed or is_drifted:
            health_status = "warning"
        else:
            health_status = "optimal"

        processed_cameras = []
        for c in sorted(dev_cams, key=lambda x: x.channel):
            is_inst = getattr(c, 'is_installed', True)
            has_image = capture_results.get(c.id, False) if is_inst else False

            if is_inst:
                if has_image:
                    rec_mode = c.recording_mode or "Continuo (24/7)"
                    video_signal = True
                    rec_status = bool(c.is_recording and is_hdd_ok)
                    snap_status = "Evidencia Fotográfica Verificada"
                else:
                    rec_mode = "Fallo de Señal / Sin Evidencia Visual"
                    video_signal = False
                    rec_status = False
                    snap_status = "Sin Señal de Video (Requiere Revisión Física)"
            else:
                rec_mode = "Puerto Libre / Sin Cámara"
                video_signal = False
                rec_status = False
                snap_status = "Puerto Libre / En Reserva"

            processed_cameras.append({
                "id": c.id,
                "name": c.name,
                "channel": c.channel,
                "is_installed": is_inst,
                "is_active": c.is_active if (is_inst and has_image) else False,
                "is_recording": rec_status,
                "recording_mode": rec_mode,
                "storage_location": c.storage_location or f"Grabación Centralizada en {dev.name} ({dev.host})",
                "has_video_signal": video_signal,
                "has_rtsp": bool(c.rtsp_url),
                "snapshot_verified": has_image,
                "snapshot_status": snap_status
            })

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
            
            # HDD & Almacenamiento Info
            "storage_media_type": dev.storage_media_type or ("HDD SATA" if "DVR" in str(dev.device_type).upper() or "NVR" in str(dev.device_type).upper() else "MicroSD / SSD Local"),
            "hdd_status": hdd_status,
            "hdd_is_ok": is_hdd_ok,
            "hdd_total_gb": dev.hdd_capacity_total_gb if dev.hdd_capacity_total_gb is not None else 0.0,
            "hdd_free_gb": dev.hdd_capacity_free_gb if dev.hdd_capacity_free_gb is not None else 0.0,
            
            # Time Sync Info
            "device_time": dev.device_time.isoformat() if dev.device_time else None,
            "time_offset_seconds": offset,
            "is_time_drifted": is_drifted,
            "time_synced_at": dev.time_synced_at.isoformat() if dev.time_synced_at else None,

            # Cameras Summary
            "total_ports": total_cams,
            "installed_cameras": dev_installed,
            "free_ports": dev_free,
            "active_cameras": dev_active_count,
            "recording_cameras": dev_recording_count,
            "cameras": processed_cameras
        })

    recent_incidents = [
        {
            "id": r.id,
            "timestamp": r.timestamp.isoformat(),
            "event_type": r.event_type,
            "description": r.description,
            "severity": r.severity
        }
        for r in recent_incident_objs
    ]

    if is_brand_new:
        audit_entry = AuditReport(
            report_code=new_report_code,
            generated_by=getattr(current_user, "username", "admin"),
            overall_sla=overall_sla,
            installed_cameras=installed_cameras,
            recording_cameras=recording_cameras,
            devices_count=total_devices,
            pdf_filename=f"{pdf_filename}.pdf",
            status="pending"
        )
    elif audit_entry:
        audit_entry.overall_sla = overall_sla
        audit_entry.installed_cameras = installed_cameras
        audit_entry.recording_cameras = recording_cameras
        audit_entry.devices_count = total_devices

    signatures = _build_signatures_dict(audit_entry)

    response_payload = {
        "report_code": new_report_code,
        "report_sequence": seq_number,
        "pdf_filename": pdf_filename,
        "generated_at": audit_entry.created_at.isoformat() if audit_entry and audit_entry.created_at else datetime.now(timezone.utc).isoformat(),
        "project_name": settings.PROJECT_NAME,
        "status": audit_entry.status if audit_entry else "pending",
        "notes": audit_entry.notes if audit_entry else None,
        "rejection_reason": audit_entry.rejection_reason if audit_entry else None,
        "rejected_by": audit_entry.rejected_by if audit_entry else None,
        "rejected_at": audit_entry.rejected_at.isoformat() if audit_entry and audit_entry.rejected_at else None,
        "signatures": signatures,
        "evidence_compliance_pct": evidence_compliance_pct,
        "verified_cameras_count": verified_cameras_count,
        "kpis": {
            "overall_sla": overall_sla,
            "total_devices": total_devices,
            "online_devices": online_devices,
            "offline_devices": offline_devices,
            "device_availability_pct": device_avail_pct,
            "total_ports": total_ports,
            "installed_cameras": installed_cameras,
            "free_ports": free_ports,
            
            # Cámaras y Grabación
            "total_cameras": installed_cameras,
            "active_cameras": active_cameras,
            "inactive_cameras": inactive_installed_cameras,
            "camera_health_pct": camera_health_pct,
            "recording_cameras": recording_cameras,
            "not_recording_cameras": not_recording_cameras,
            "recording_compliance_pct": recording_compliance_pct,
            
            # Almacenamiento HDD
            "hdd_healthy_devices": hdd_healthy_devices,
            "hdd_unhealthy_devices": hdd_unhealthy_devices,
            "hdd_health_pct": hdd_pct,
            
            # Desfase Horario
            "drifted_devices_count": drifted_count,
            
            # Eventos
            "total_events": total_events,
            "critical_events": critical_events,
            "warning_events": warning_events,
            "info_events": info_events
        },
        "devices": devices_list,
        "recent_incidents": recent_incidents
    }

    if audit_entry:
        try:
            audit_entry.report_data_json = json.dumps(response_payload, ensure_ascii=False)
            session.add(audit_entry)
            session.commit()
            session.refresh(audit_entry)
        except Exception:
            session.rollback()

    return response_payload


@router.post("/{report_code}/sign")
async def sign_report(
    report_code: str,
    role_type: Optional[str] = None, # 'technician' | 'coordinator'
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin)
) -> Dict[str, Any]:
    _validate_report_code_dir(report_code)
    audit_entry = session.exec(select(AuditReport).where(AuditReport.report_code == report_code)).first()
    if not audit_entry:
        raise HTTPException(status_code=404, detail="Informe de auditoría no encontrado")

    user_role_str = str(current_user.role.value if hasattr(current_user.role, "value") else current_user.role).lower()
    now_utc = datetime.now(timezone.utc)
    full_name = current_user.full_name or current_user.username

    # Estricta Segregación de Funciones (Segregation of Duties):
    # - 'coordinator' (V° B°) SOLO puede ser firmado por usuarios con rol 'admin'
    # - 'technician' (Firma Técnica) SOLO puede ser firmado por personal de soporte/operadores ('operator' o 'viewer')
    target_role = role_type or ("coordinator" if user_role_str == "admin" else "technician")

    if target_role == "coordinator":
        if user_role_str != "admin":
            raise HTTPException(
                status_code=403,
                detail="Acceso Denegado: Solo el Coordinador del Área de TI (Administrador) tiene autorización para emitir el V° B° de conformidad."
            )
    elif target_role == "technician":
        if user_role_str == "admin":
            raise HTTPException(
                status_code=403,
                detail="Segregación de Funciones: El Administrador/Coordinador de TI no puede autofirmar como Técnico de Soporte. La verificación operativa debe ser efectuada por la cuenta de un Técnico/Operador."
            )

    # Congelar físicamente en disco la evidencia fotográfica de todas las cámaras instaladas en este momento
    all_devices = session.exec(select(Device)).all()
    devices_dict = {d.id: d for d in all_devices}
    installed_cameras = [c for c in session.exec(select(Camera)).all() if getattr(c, 'is_installed', True)]
    await _save_report_camera_snapshots(report_code, installed_cameras, devices_dict)

    # Generar sello criptográfico forense SHA-256
    hash_payload = f"{report_code}:{target_role}:{current_user.username}:{now_utc.isoformat()}:{audit_entry.overall_sla}"
    sig_hash = f"SHA256-{hashlib.sha256(hash_payload.encode('utf-8')).hexdigest()[:14].upper()}"

    if target_role == "technician":
        audit_entry.technician_signed = True
        audit_entry.technician_signed_by = full_name
        audit_entry.technician_username = current_user.username
        audit_entry.technician_signed_at = now_utc
        audit_entry.technician_hash = sig_hash
        # Pasa de Borrador a Pendiente de Aprobación de Coordinación
        audit_entry.status = "approved" if audit_entry.coordinator_signed else "pending"
    else:
        audit_entry.coordinator_signed = True
        audit_entry.coordinator_signed_by = full_name
        audit_entry.coordinator_username = current_user.username
        audit_entry.coordinator_signed_at = now_utc
        audit_entry.coordinator_hash = sig_hash
        audit_entry.status = "approved" # Aprobación definitiva oficial
        audit_entry.rejection_reason = None
        audit_entry.rejected_by = None
        audit_entry.rejected_at = None

    signatures_dict = _build_signatures_dict(audit_entry)
    if audit_entry.report_data_json:
        try:
            snap_json = json.loads(audit_entry.report_data_json)
            snap_json["status"] = audit_entry.status
            snap_json["signatures"] = signatures_dict
            audit_entry.report_data_json = json.dumps(snap_json, ensure_ascii=False)
        except Exception:
            pass

    session.add(audit_entry)
    session.commit()
    session.refresh(audit_entry)

    return {
        "status": "success",
        "message": f"Informe firmado exitosamente como {'Coordinador del Área de TI' if target_role == 'coordinator' else 'Técnico de Soporte'}",
        "report_code": report_code,
        "signatures": signatures_dict
    }


@router.put("/audit-reports/{report_code}")
def update_report_notes(
    report_code: str,
    payload: UpdateAuditNotesRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin)
) -> Dict[str, Any]:
    """Permite editar notas, conclusiones y observaciones técnicas del informe."""
    audit_entry = session.exec(select(AuditReport).where(AuditReport.report_code == report_code)).first()
    if not audit_entry:
        raise HTTPException(status_code=404, detail="Informe de auditoría no encontrado")

    audit_entry.notes = payload.notes
    session.add(audit_entry)
    session.commit()
    session.refresh(audit_entry)

    return {
        "status": "success",
        "message": "Observaciones del informe actualizadas correctamente",
        "report_code": report_code,
        "notes": audit_entry.notes
    }


@router.post("/audit-reports/{report_code}/reject")
def reject_report(
    report_code: str,
    payload: RejectAuditReportRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
) -> Dict[str, Any]:
    """Permite al Coordinador de TI (Administrador) rechazar un informe con justificación técnica."""
    audit_entry = session.exec(select(AuditReport).where(AuditReport.report_code == report_code)).first()
    if not audit_entry:
        raise HTTPException(status_code=404, detail="Informe de auditoría no encontrado")

    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Debe proporcionar un motivo o justificación de rechazo.")

    audit_entry.status = "rejected"
    audit_entry.rejection_reason = payload.reason.strip()
    audit_entry.rejected_by = current_user.full_name or current_user.username
    audit_entry.rejected_at = datetime.now(timezone.utc)
    
    # Invalidar V° B° si existiera
    audit_entry.coordinator_signed = False
    audit_entry.coordinator_signed_by = None
    audit_entry.coordinator_username = None
    audit_entry.coordinator_signed_at = None
    audit_entry.coordinator_hash = None

    session.add(audit_entry)
    session.commit()
    session.refresh(audit_entry)

    return {
        "status": "success",
        "message": f"El informe {report_code} ha sido rechazado formalmente",
        "report_code": report_code,
        "rejection_reason": audit_entry.rejection_reason,
        "rejected_by": audit_entry.rejected_by,
        "rejected_at": audit_entry.rejected_at.isoformat()
    }


@router.delete("/audit-reports/{report_code}")
def delete_audit_report(
    report_code: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin)
) -> Dict[str, Any]:
    """Permite al Administrador eliminar permanentemente un informe de auditoría."""
    audit_entry = session.exec(select(AuditReport).where(AuditReport.report_code == report_code)).first()
    if not audit_entry:
        raise HTTPException(status_code=404, detail="Informe de auditoría no encontrado")

    session.delete(audit_entry)
    session.commit()

    return {
        "status": "success",
        "message": f"Informe {report_code} eliminado permanentemente"
    }


@router.post("/{report_code}/reset-signatures")
def reset_report_signatures(
    report_code: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin)
) -> Dict[str, Any]:
    user_role_str = str(current_user.role.value if hasattr(current_user.role, "value") else current_user.role).lower()
    if user_role_str != "admin":
        raise HTTPException(status_code=403, detail="Solo el Administrador puede reiniciar las firmas de un informe.")

    audit_entry = session.exec(select(AuditReport).where(AuditReport.report_code == report_code)).first()
    if not audit_entry:
        raise HTTPException(status_code=404, detail="Informe de auditoría no encontrado")

    audit_entry.technician_signed = False
    audit_entry.technician_signed_by = None
    audit_entry.technician_username = None
    audit_entry.technician_signed_at = None
    audit_entry.technician_hash = None

    audit_entry.coordinator_signed = False
    audit_entry.coordinator_signed_by = None
    audit_entry.coordinator_username = None
    audit_entry.coordinator_signed_at = None
    audit_entry.coordinator_hash = None

    audit_entry.status = "pending"
    audit_entry.rejection_reason = None
    audit_entry.rejected_by = None
    audit_entry.rejected_at = None

    session.add(audit_entry)
    session.commit()
    session.refresh(audit_entry)

    return {"status": "success", "message": "Firmas reiniciadas exitosamente"}
