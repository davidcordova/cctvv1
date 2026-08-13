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
    cameras: List["Camera"] = Relationship(back_populates="device")

class Camera(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    channel: int
    device_id: int = Field(foreign_key="device.id")
    device: Device = Relationship(back_populates="cameras")
    rtsp_url: Optional[str] = None
    is_active: bool = Field(default=True)

class ViewGroup(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    # Many-to-many relationship with cameras could be added here later

class Report(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    device_id: int = Field(foreign_key="device.id")
    event_type: str
    description: str
    severity: str # info, warning, error
