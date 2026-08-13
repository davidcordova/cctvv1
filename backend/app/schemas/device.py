from typing import Optional
from sqlmodel import SQLModel
from app.models.models import DeviceType, Brand

class DeviceBase(SQLModel):
    name: str
    host: str
    port: int = 80
    username: str
    device_type: DeviceType
    brand: Brand
    channel_count: Optional[int] = 8
    serial_number: Optional[str] = None

class DeviceCreate(DeviceBase):
    password: str

class DeviceUpdate(SQLModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    device_type: Optional[DeviceType] = None
    brand: Optional[Brand] = None
    channel_count: Optional[int] = None
    serial_number: Optional[str] = None

class DeviceRead(DeviceBase):
    id: int
    is_online: bool = False

