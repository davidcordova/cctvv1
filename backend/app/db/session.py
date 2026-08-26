from sqlalchemy import text
from sqlmodel import create_engine, Session, SQLModel
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

def init_db_schema():
    """Crea tablas faltantes y migra columnas de forma segura en SQLite."""
    SQLModel.metadata.create_all(engine)
    if is_sqlite:
        with engine.connect() as conn:
            try:
                res = conn.execute(text("PRAGMA table_info(camera)"))
                existing_cols = {row[1] for row in res.fetchall()}
                
                cols_to_add = [
                    ("is_installed", "BOOLEAN DEFAULT 1"),
                    ("is_recording", "BOOLEAN DEFAULT 1"),
                    ("recording_mode", "VARCHAR DEFAULT 'Continuo (24/7)'"),
                    ("storage_location", "VARCHAR"),
                    ("has_video_signal", "BOOLEAN DEFAULT 1"),
                    ("audio_enabled", "BOOLEAN DEFAULT 0"),
                ]
                for col_name, col_type in cols_to_add:
                    if col_name not in existing_cols:
                        try:
                            conn.execute(text(f"ALTER TABLE camera ADD COLUMN {col_name} {col_type}"))
                            conn.commit()
                        except Exception:
                            pass

                res_dev = conn.execute(text("PRAGMA table_info(device)"))
                existing_dev_cols = {row[1] for row in res_dev.fetchall()}
                dev_cols = [
                    ("storage_media_type", "VARCHAR DEFAULT 'HDD SATA'"),
                    ("hdd_status", "VARCHAR DEFAULT 'Normal (Formato OK)'"),
                    ("hdd_capacity_total_gb", "FLOAT"),
                    ("hdd_capacity_free_gb", "FLOAT"),
                    ("device_time", "DATETIME"),
                    ("time_offset_seconds", "INTEGER DEFAULT 0"),
                    ("time_synced_at", "DATETIME"),
                ]
                for col_name, col_type in dev_cols:
                    if col_name not in existing_dev_cols:
                        try:
                            conn.execute(text(f"ALTER TABLE device ADD COLUMN {col_name} {col_type}"))
                            conn.commit()
                        except Exception:
                            pass
            except Exception:
                pass

def get_session():
    with Session(engine) as session:
        yield session

