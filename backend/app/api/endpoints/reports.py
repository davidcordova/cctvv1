from datetime import datetime, timezone
from typing import Any, List, Dict, Optional
import os
import asyncio
import hashlib
import json
import httpx
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Body, Response
from fastapi.responses import FileResponse
from sqlmodel import Session, select, col
from app.db.session import get_session
from app.models.models import Report, Device, Camera, User, AuditReport
from app.core.security import require_operator_or_admin, require_admin
from app.core.config import settings

router = APIRouter()

STORAGE_REPORTS_DIR = os.path.join(os.getcwd(), "storage", "reports")
os.makedirs(STORAGE_REPORTS_DIR, exist_ok=True)

class UpdateAuditNotesRequest(BaseModel):
    notes: Optional[str] = None

class RejectAuditReportRequest(BaseModel):
    reason: str

async def _save_report_camera_snapshots(report_code: str, cameras_list: list):
    """Guarda en disco las fotos de todas las cámaras al momento de generar el informe."""
    report_dir = os.path.join(STORAGE_REPORTS_DIR, report_code)
    os.makedirs(report_dir, exist_ok=True)
    async with httpx.AsyncClient(timeout=3.0) as client:
        for cam in cameras_list:
            cam_id = cam.id
            file_path = os.path.join(report_dir, f"{cam_id}.jpg")
            if os.path.exists(file_path):
                continue
            try:
                res = await client.get(f"http://localhost:1984/api/frame.jpeg?src=camera_{cam_id}")
                if res.status_code == 200 and len(res.content) > 1000:
                    with open(file_path, "wb") as f:
                        f.write(res.content)
            except Exception:
                pass

@router.get("/{report_code}/snapshots/{camera_id}")
async def get_report_snapshot(report_code: str, camera_id: int):
    """Devuelve la captura fotográfica congelada en disco para el informe especificado (carga instantánea)."""
    report_dir = os.path.join(STORAGE_REPORTS_DIR, report_code)
    file_path = os.path.join(report_dir, f"{camera_id}.jpg")
    
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable"})
        
    # Si aún no existe en disco (reportes anteriores a esta función), capturarla y congelarla
    os.makedirs(report_dir, exist_ok=True)
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            res = await client.get(f"http://localhost:1984/api/frame.jpeg?src=camera_{camera_id}")
            if res.status_code == 200 and len(res.content) > 1000:
                with open(file_path, "wb") as f:
                    f.write(res.content)
                return FileResponse(file_path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable"})
    except Exception:
        pass
        
    # Fallback si la cámara no tuvo señal
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225" fill="#09090b">
    <rect width="400" height="225" fill="#09090b"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#71717a" font-family="sans-serif" font-size="14" font-weight="bold">SIN REGISTRO / CÁMARA DESCONECTADA</text>
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
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin)
) -> Dict[str, Any]:
    """Lista avanzada con filtros, estadísticas y paginación para la gestión de informes de auditoría."""
    query = select(AuditReport)

    all_reports = session.exec(select(AuditReport)).all()
    total_count = len(all_reports)
    approved_count = len([r for r in all_reports if r.status == "approved" or (r.coordinator_signed and r.technician_signed)])
    rejected_count = len([r for r in all_reports if r.status == "rejected"])
    pending_count = total_count - approved_count - rejected_count

    # Filtros
    if status and status != "all":
        if status == "approved":
            query = query.where((AuditReport.status == "approved") | ((AuditReport.coordinator_signed == True) & (AuditReport.technician_signed == True)))
        elif status == "rejected":
            query = query.where(AuditReport.status == "rejected")
        elif status == "pending":
            query = query.where((AuditReport.status != "approved") & (AuditReport.status != "rejected") & ((AuditReport.coordinator_signed == False) | (AuditReport.technician_signed == False)))

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.where(
            (AuditReport.report_code.ilike(term)) |
            (AuditReport.generated_by.ilike(term)) |
            (AuditReport.technician_signed_by.ilike(term)) |
            (AuditReport.coordinator_signed_by.ilike(term)) |
            (AuditReport.notes.ilike(term))
        )

    results = session.exec(query.order_by(AuditReport.id.desc()).offset(skip).limit(limit)).all()

    # Formatear lista con datos de presentación
    formatted = []
    for r in results:
        is_approved = r.status == "approved" or (r.coordinator_signed and r.technician_signed)
        is_rejected = r.status == "rejected"
        status_label = "approved" if is_approved else "rejected" if is_rejected else "pending"

        formatted.append({
            "id": r.id,
            "report_code": r.report_code,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "generated_by": r.generated_by or "admin",
            "overall_sla": r.overall_sla,
            "installed_cameras": r.installed_cameras,
            "recording_cameras": r.recording_cameras,
            "devices_count": r.devices_count,
            "pdf_filename": r.pdf_filename,
            "status": status_label,
            "notes": r.notes,
            "rejection_reason": r.rejection_reason,
            "rejected_by": r.rejected_by,
            "rejected_at": r.rejected_at.isoformat() if r.rejected_at else None,
            "signatures": {
                "technician": {
                    "signed": bool(r.technician_signed),
                    "signed_by": r.technician_signed_by,
                    "signed_at": r.technician_signed_at.isoformat() if r.technician_signed_at else None
                },
                "coordinator": {
                    "signed": bool(r.coordinator_signed),
                    "signed_by": r.coordinator_signed_by,
                    "signed_at": r.coordinator_signed_at.isoformat() if r.coordinator_signed_at else None
                }
            }
        })

    return {
        "reports": formatted,
        "stats": {
            "total": total_count,
            "approved": approved_count,
            "pending": pending_count,
            "rejected": rejected_count
        }
    }


@router.get("/executive-summary")
async def get_executive_summary(
    report_code: Optional[str] = None,
    force_new: bool = False,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin)
):
    devices = session.exec(select(Device)).all()
    cameras = session.exec(select(Camera)).all()
    reports = session.exec(select(Report).order_by(Report.timestamp.desc())).all()

    total_devices = len(devices)
    online_devices = len([d for d in devices if d.is_online])
    offline_devices = total_devices - online_devices
    device_avail_pct = round((online_devices / total_devices * 100), 1) if total_devices > 0 else 100.0

    # Capacidad Total de Puertos vs Cámaras Físicas Instaladas
    total_ports = len(cameras)
    installed_cameras = len([c for c in cameras if getattr(c, 'is_installed', True)])
    free_ports = total_ports - installed_cameras

    # Cámaras activas en servicio (sobre las instaladas)
    active_cameras = len([c for c in cameras if getattr(c, 'is_installed', True) and c.is_active])
    inactive_installed_cameras = installed_cameras - active_cameras
    camera_health_pct = round((active_cameras / installed_cameras * 100), 1) if installed_cameras > 0 else 100.0

    # Métricas de Grabación Activa
    recording_cameras = len([c for c in cameras if getattr(c, 'is_installed', True) and c.is_recording and c.is_active])
    not_recording_cameras = installed_cameras - recording_cameras
    recording_compliance_pct = round((recording_cameras / installed_cameras * 100), 1) if installed_cameras > 0 else 100.0

    # 2. Métricas de Salud de Disco Duro (HDD)
    hdd_healthy_devices = 0
    hdd_unhealthy_devices = 0
    for d in devices:
        status_lower = (d.hdd_status or "normal").lower()
        if d.is_online and any(ok_word in status_lower for ok_word in ("normal", "formato ok", "ok", "formatted")):
            hdd_healthy_devices += 1
        else:
            hdd_unhealthy_devices += 1

    # 3. Métricas de Desfase de Hora (Time Drift > 5 minutos = 300 segundos)
    drifted_devices = []
    for d in devices:
        offset = d.time_offset_seconds or 0
        if d.is_online and abs(offset) > 300:
            drifted_devices.append(d.id)
    drifted_count = len(drifted_devices)

    # SLA Ponderado Real
    hdd_pct = round((hdd_healthy_devices / total_devices * 100), 1) if total_devices > 0 else 100.0
    overall_sla = round(
        (device_avail_pct * 0.35 + recording_compliance_pct * 0.35 + hdd_pct * 0.15 + camera_health_pct * 0.15), 
        1
    ) if total_devices > 0 else 100.0

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
        dev_installed = len([c for c in dev_cams if getattr(c, 'is_installed', True)])
        dev_free = len(dev_cams) - dev_installed
        active_count = len([c for c in dev_cams if getattr(c, 'is_installed', True) and c.is_active])
        recording_count = len([c for c in dev_cams if getattr(c, 'is_installed', True) and c.is_recording and c.is_active])
        total_cams = len(dev_cams)
        
        offset = dev.time_offset_seconds or 0
        is_drifted = abs(offset) > 300
        
        hdd_status = dev.hdd_status or "Normal (Formato OK)"
        is_hdd_ok = dev.is_online and any(ok_word in hdd_status.lower() for ok_word in ("normal", "formato ok", "ok", "formatted"))

        if not dev.is_online or not is_hdd_ok:
            health_status = "critical"
        elif active_count < dev_installed or recording_count < dev_installed or is_drifted:
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
            
            # HDD Info
            "hdd_status": hdd_status,
            "hdd_is_ok": is_hdd_ok,
            "hdd_total_gb": dev.hdd_capacity_total_gb or 2000.0,
            "hdd_free_gb": dev.hdd_capacity_free_gb or 420.0,
            
            # Time Sync Info
            "device_time": dev.device_time.isoformat() if dev.device_time else None,
            "time_offset_seconds": offset,
            "is_time_drifted": is_drifted,
            "time_synced_at": dev.time_synced_at.isoformat() if dev.time_synced_at else None,

            # Cameras Summary
            "total_ports": total_cams,
            "installed_cameras": dev_installed,
            "free_ports": dev_free,
            "active_cameras": active_count,
            "recording_cameras": recording_count,
            "cameras": [
                {
                    "id": c.id,
                    "name": c.name,
                    "channel": c.channel,
                    "is_installed": getattr(c, 'is_installed', True),
                    "is_active": c.is_active,
                    "is_recording": c.is_recording,
                    "recording_mode": c.recording_mode or ("Continuo (24/7)" if getattr(c, 'is_installed', True) and c.is_active else "Puerto Libre / Sin Cámara"),
                    "has_video_signal": c.has_video_signal,
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

    # Generación y persistencia de correlativo oficial único para el informe
    today_str = datetime.now().strftime("%Y%m%d")
    code_prefix = f"INF-CCTV-{today_str}-"
    
    audit_entry = None

    # 1. Si el cliente solicita un reporte específico por su código correlativo
    if report_code:
        audit_entry = session.exec(select(AuditReport).where(AuditReport.report_code == report_code)).first()

    # 2. Si no se fuerza uno nuevo y no se especificó código, buscar el más reciente
    if not audit_entry and not force_new:
        existing_for_today = session.exec(
            select(AuditReport).where(AuditReport.report_code.startswith(code_prefix)).order_by(AuditReport.id.desc())
        ).all()
        if existing_for_today:
            audit_entry = existing_for_today[0]

    # 3. Si se solicita forzar nuevo o no existe ninguno hoy, crear una nueva entrada con nuevo correlativo
    is_brand_new = False
    if not audit_entry:
        is_brand_new = True
        existing_count = len(session.exec(select(AuditReport).where(AuditReport.report_code.startswith(code_prefix))).all())
        seq_number = existing_count + 1
        new_report_code = f"INF-CCTV-{today_str}-{seq_number:04d}"
        pdf_filename = f"{new_report_code}_Informe_Ejecutivo_CCTV"

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
        try:
            session.add(audit_entry)
            session.commit()
            session.refresh(audit_entry)
        except Exception:
            session.rollback()
    else:
        new_report_code = audit_entry.report_code
        seq_number = int(new_report_code.split("-")[-1]) if "-" in new_report_code else 1
        pdf_filename = f"{new_report_code}_Informe_Ejecutivo_CCTV"

    # Si es un reporte nuevo o no tiene fotos archivadas, guardar capturas en segundo plano
    try:
        installed_cams_objs = [c for c in cameras if getattr(c, 'is_installed', True)]
        asyncio.create_task(_save_report_camera_snapshots(new_report_code, installed_cams_objs))
    except Exception:
        pass

    signatures = {
        "technician": {
            "signed": bool(audit_entry.technician_signed),
            "signed_by": audit_entry.technician_signed_by,
            "username": audit_entry.technician_username,
            "signed_at": audit_entry.technician_signed_at.isoformat() if audit_entry.technician_signed_at else None,
            "hash": audit_entry.technician_hash
        },
        "coordinator": {
            "signed": bool(audit_entry.coordinator_signed),
            "signed_by": audit_entry.coordinator_signed_by,
            "username": audit_entry.coordinator_username,
            "signed_at": audit_entry.coordinator_signed_at.isoformat() if audit_entry.coordinator_signed_at else None,
            "hash": audit_entry.coordinator_hash
        }
    }

    return {
        "report_code": new_report_code,
        "report_sequence": seq_number,
        "pdf_filename": pdf_filename,
        "generated_at": audit_entry.created_at.isoformat() if audit_entry.created_at else datetime.now(timezone.utc).isoformat(),
        "project_name": settings.PROJECT_NAME,
        "status": audit_entry.status or "pending",
        "notes": audit_entry.notes,
        "rejection_reason": audit_entry.rejection_reason,
        "rejected_by": audit_entry.rejected_by,
        "rejected_at": audit_entry.rejected_at.isoformat() if audit_entry.rejected_at else None,
        "signatures": signatures,
        "kpis": {
            "overall_sla": overall_sla,
            "total_devices": total_devices,
            "online_devices": online_devices,
            "offline_devices": offline_devices,
            "device_availability_pct": device_avail_pct,
            
            # Inventario de Puertos y Cámaras
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
            "total_events": len(reports),
            "critical_events": critical_events,
            "warning_events": warning_events,
            "info_events": info_events
        },
        "devices": devices_list,
        "recent_incidents": recent_incidents
    }


@router.post("/{report_code}/sign")
async def sign_report(
    report_code: str,
    role_type: Optional[str] = None, # 'technician' | 'coordinator'
    session: Session = Depends(get_session),
    current_user: User = Depends(require_operator_or_admin)
) -> Dict[str, Any]:
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

    # Congelar físicamente en disco la evidencia fotográfica de todas las cámaras en este momento
    all_cameras = session.exec(select(Camera)).all()
    await _save_report_camera_snapshots(report_code, all_cameras)

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

    session.add(audit_entry)
    session.commit()
    session.refresh(audit_entry)

    return {
        "status": "success",
        "message": f"Informe firmado exitosamente como {'Coordinador del Área de TI' if target_role == 'coordinator' else 'Técnico de Soporte'}",
        "report_code": report_code,
        "signatures": {
            "technician": {
                "signed": bool(audit_entry.technician_signed),
                "signed_by": audit_entry.technician_signed_by,
                "username": audit_entry.technician_username,
                "signed_at": audit_entry.technician_signed_at.isoformat() if audit_entry.technician_signed_at else None,
                "hash": audit_entry.technician_hash
            },
            "coordinator": {
                "signed": bool(audit_entry.coordinator_signed),
                "signed_by": audit_entry.coordinator_signed_by,
                "username": audit_entry.coordinator_username,
                "signed_at": audit_entry.coordinator_signed_at.isoformat() if audit_entry.coordinator_signed_at else None,
                "hash": audit_entry.coordinator_hash
            }
        }
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
