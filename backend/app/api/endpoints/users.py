from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.db.session import get_session
from app.models.models import User
from app.schemas.user import UserCreate, UserUpdate, UserRead

router = APIRouter()

@router.get("/", response_model=List[UserRead])
def read_users(
    session: Session = Depends(get_session),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    users = session.exec(select(User).offset(skip).limit(limit)).all()
    return users

from app.core import security

@router.post("/", response_model=UserRead)
def create_user(
    *,
    session: Session = Depends(get_session),
    user_in: UserCreate
) -> Any:
    existing_user = session.exec(select(User).where(User.username == user_in.username)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")

    db_user = User(
        username=user_in.username,
        full_name=user_in.full_name,
        hashed_password=security.get_password_hash(user_in.password),
        role=user_in.role,
        is_active=user_in.is_active
    )
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user

@router.put("/{user_id}", response_model=UserRead)
def update_user(
    *,
    session: Session = Depends(get_session),
    user_id: int,
    user_in: UserUpdate
) -> Any:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_in.model_dump(exclude_unset=True)

    if "username" in update_data and update_data["username"] != user.username:
        existing = session.exec(select(User).where(User.username == update_data["username"])).first()
        if existing:
            raise HTTPException(status_code=400, detail="El nombre de usuario ya está ocupado")

    if "password" in update_data and update_data["password"]:
        user.hashed_password = security.get_password_hash(update_data["password"])
        del update_data["password"]

    for key, value in update_data.items():
        setattr(user, key, value)
            
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(
    *,
    session: Session = Depends(get_session),
    user_id: int
) -> Any:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    session.delete(user)
    session.commit()
    return {"ok": True}
