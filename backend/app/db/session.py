from sqlmodel import create_engine, Session
from app.core.config import settings

# Configurar pool robusto para evitar bloqueos por concurrencia
is_sqlite = "sqlite" in settings.DATABASE_URL.lower()
engine_args = {
    "echo": False,
    "pool_pre_ping": True,
}
if not is_sqlite:
    engine_args.update({
        "pool_size": 25,
        "max_overflow": 50,
        "pool_timeout": 30,
        "pool_recycle": 1800,
    })

engine = create_engine(settings.DATABASE_URL, **engine_args)

def get_session():
    with Session(engine) as session:
        yield session

