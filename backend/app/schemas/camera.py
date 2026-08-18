from typing import Optional
from sqlmodel import SQLModel

class CameraUpdate(SQLModel):
    name: Optional[str] = None
    rtsp_url: Optional[str] = None
    is_active: Optional[bool] = None
    is_installed: Optional[bool] = None
    is_recording: Optional[bool] = None
    recording_mode: Optional[str] = None
    has_video_signal: Optional[bool] = None
    audio_enabled: Optional[bool] = None
