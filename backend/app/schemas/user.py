from typing import Optional
from sqlmodel import SQLModel
from app.models.models import UserRole

class UserBase(SQLModel):
    username: str
    full_name: str
    role: UserRole = UserRole.VIEWER
    is_active: bool = True

class UserCreate(UserBase):
    password: str

class UserUpdate(SQLModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None

class UserRead(UserBase):
    id: int

