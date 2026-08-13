from typing import Optional
from sqlmodel import SQLModel

class CameraUpdate(SQLModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    is_active: Optional[bool] = None
