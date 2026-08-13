from typing import Any, List
from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from app.db.session import get_session
from app.models.models import Report

router = APIRouter()

@router.get("/", response_model=List[Report])
def read_reports(
    session: Session = Depends(get_session),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    reports = session.exec(select(Report).order_by(Report.timestamp.desc()).offset(skip).limit(limit)).all()
    return reports
