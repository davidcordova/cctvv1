from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.db.session import get_session
from app.models.models import User, UserCameraLink
from app.schemas.user import UserCreate, UserUpdate, UserRead
from app.core.security import require_admin, get_password_hash

router = APIRouter()

def _get_user_camera_ids(session: Session, user_id: int) -> List[int]:
    links = session.exec(select(UserCameraLink).where(UserCameraLink.user_id == user_id)).all()
    return [l.camera_id for l in links]

def _sync_user_cameras(session: Session, user_id: int, camera_ids: List[int]):
    old_links = session.exec(select(UserCameraLink).where(UserCameraLink.user_id == user_id)).all()
    for l in old_links:
        session.delete(l)
    session.flush()
    if camera_ids:
        for cid in set(camera_ids):
            session.add(UserCameraLink(user_id=user_id, camera_id=cid))
    session.commit()

@router.get("/", response_model=List[UserRead])
def read_users(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    users = session.exec(select(User).offset(skip).limit(limit)).all()
    result = []
    for u in users:
        u_read = UserRead.model_validate(u)
        u_read.camera_ids = _get_user_camera_ids(session, u.id)
        result.append(u_read)
    return result

@router.post("/", response_model=UserRead)
def create_user(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
    user_in: UserCreate
) -> Any:
    existing_user = session.exec(select(User).where(User.username == user_in.username)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")

    db_user = User(
        username=user_in.username,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        is_active=user_in.is_active
    )
    session.add(db_user)
    session.commit()
    session.refresh(db_user)

    if user_in.camera_ids is not None:
        _sync_user_cameras(session, db_user.id, user_in.camera_ids)

    res = UserRead.model_validate(db_user)
    res.camera_ids = _get_user_camera_ids(session, db_user.id)
    return res

@router.put("/{user_id}", response_model=UserRead)
def update_user(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
    user_id: int,
    user_in: UserUpdate
) -> Any:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_in.model_dump(exclude_unset=True)

    camera_ids_to_sync = None
    if "camera_ids" in update_data:
        camera_ids_to_sync = update_data.pop("camera_ids")

    if "username" in update_data and update_data["username"] != user.username:
        existing = session.exec(select(User).where(User.username == update_data["username"])).first()
        if existing:
            raise HTTPException(status_code=400, detail="El nombre de usuario ya está ocupado")

    if "password" in update_data:
        pwd = update_data.pop("password")
        if pwd:
            user.hashed_password = get_password_hash(pwd)

    for key, value in update_data.items():
        setattr(user, key, value)
            
    session.add(user)
    session.commit()
    session.refresh(user)

    if camera_ids_to_sync is not None:
        _sync_user_cameras(session, user.id, camera_ids_to_sync)

    res = UserRead.model_validate(user)
    res.camera_ids = _get_user_camera_ids(session, user.id)
    return res


@router.delete("/{user_id}")
def delete_user(
    *,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
    user_id: int
) -> Any:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario en sesión activa.")

    if user.username == "admin":
        raise HTTPException(status_code=400, detail="No se puede eliminar la cuenta del Administrador principal del sistema.")

    # Delete camera links
    links = session.exec(select(UserCameraLink).where(UserCameraLink.user_id == user_id)).all()
    for l in links:
        session.delete(l)

    session.delete(user)
    session.commit()
    return {"ok": True, "message": f"Usuario {user.username} eliminado correctamente"}
