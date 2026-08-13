from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from app.db.session import get_session
from app.models.models import User
from app.core import security
from app.core.config import settings

router = APIRouter()

@router.post("/login")
def login(
    session: Session = Depends(get_session),
    form_data: OAuth2PasswordRequestForm = Depends()
):
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        user.id, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/register")
def register(
    *,
    session: Session = Depends(get_session),
    username: str,
    password: str,
    full_name: str
):
    user = session.exec(select(User).where(User.username == username)).first()
    if user:
        raise HTTPException(status_code=400, detail="User already exists")
    
    db_user = User(
        username=username,
        hashed_password=security.get_password_hash(password),
        full_name=full_name
    )
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user
