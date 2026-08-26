from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional
from sqlmodel import Field, Relationship, SQLModel

class DeviceType(str, Enum):
    DVR = "DVR"
    NVR = "NVR"
    IPC = "IPC"

class Brand(str, Enum):
    HIKVISION = "Hikvision"
    EZVIZ = "Ezviz"
    DAHUA = "Dahua"
    HILOOK = "HiLook"
    UNIVIEW = "Uniview"
    GENERIC = "Generico"

class UserRole(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str
    full_name: str
    role: UserRole = Field(default=UserRole.VIEWER)
    is_active: bool = Field(default=True)

class UserCameraLink(SQLModel, table=True):
    __tablename__ = "user_camera_links"
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    camera_id: int = Field(foreign_key="camera.id", primary_key=True)

class Device(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    host: str
    port: int = Field(default=80)
    username: str
    password: str
    device_type: DeviceType
    brand: Brand
    channel_count: Optional[int] = Field(default=8)
    serial_number: Optional[str] = None
    is_online: bool = Field(default=False)
    
    # HDD & Almacenamiento Real y Telemetría
    storage_media_type: Optional[str] = Field(default="HDD SATA") # "HDD SATA", "MicroSD / SSD Local", "NAS / Red", "Sin Almacenamiento Local"
    hdd_status: Optional[str] = Field(default="Normal (Formato OK)")
    hdd_capacity_total_gb: Optional[float] = Field(default=None)
    hdd_capacity_free_gb: Optional[float] = Field(default=None)
    
    # Sincronización de Fecha y Hora con Servidor
    device_time: Optional[datetime] = None
    time_offset_seconds: Optional[int] = Field(default=0)
    time_synced_at: Optional[datetime] = None
    
    cameras: List["Camera"] = Relationship(back_populates="device")

class Camera(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    channel: int
    device_id: int = Field(foreign_key="device.id")
    device: Device = Relationship(back_populates="cameras")
    rtsp_url: Optional[str] = None
    is_active: bool = Field(default=True)
    
    # Asignación de Puerto / Inventario Físico
    is_installed: bool = Field(default=True) # True: Cámara conectada / False: Puerto libre o en reserva
    
    # Modalidad de Grabación, Almacenamiento y Señal
    is_recording: bool = Field(default=True)
    recording_mode: Optional[str] = Field(default="Continuo (24/7)")
    storage_location: Optional[str] = Field(default=None) # ej. "NVR Centralizado (192.168.3.82)", "MicroSD Local", "DVR Local"
    has_video_signal: bool = Field(default=True)
    audio_enabled: bool = Field(default=False) # True: Audio activado / False: Silenciado (Por defecto)

class ViewGroup(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None

class Report(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    device_id: int = Field(foreign_key="device.id")
    event_type: str
    description: str
    severity: str # info, warning, error

class AuditReport(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    report_code: str = Field(index=True, unique=True) # e.g. INF-CCTV-20260817-0001
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    generated_by: Optional[str] = None # username
    overall_sla: float = 100.0
    installed_cameras: int = 0
    recording_cameras: int = 0
    devices_count: int = 0
    pdf_filename: str = ""

    # Firma Digital del Técnico de Soporte (Operador)
    technician_signed: bool = Field(default=False)
    technician_signed_by: Optional[str] = Field(default=None)
    technician_username: Optional[str] = Field(default=None)
    technician_signed_at: Optional[datetime] = Field(default=None)
    technician_hash: Optional[str] = Field(default=None)

    # Firma Digital del Coordinador de TI (Admin)
    coordinator_signed: bool = Field(default=False)
    coordinator_signed_by: Optional[str] = Field(default=None)
    coordinator_username: Optional[str] = Field(default=None)
    coordinator_signed_at: Optional[datetime] = Field(default=None)
    coordinator_hash: Optional[str] = Field(default=None)

    # Estado y Flujo de Aprobación
    status: str = Field(default="pending", index=True) # pending, approved, rejected
    notes: Optional[str] = Field(default=None)
    rejection_reason: Optional[str] = Field(default=None)
    rejected_by: Optional[str] = Field(default=None)
    rejected_at: Optional[datetime] = Field(default=None)
    report_data_json: Optional[str] = Field(default=None)
