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
    """Crea tablas faltantes y migra columnas de forma segura tanto en PostgreSQL como en SQLite."""
    SQLModel.metadata.create_all(engine)
    try:
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())

        with engine.connect() as conn:
            # 1. Migrar tabla 'camera'
            if 'camera' in tables:
                existing_cols = {col['name'] for col in inspector.get_columns('camera')}
                camera_cols = [
                    ("is_installed", "BOOLEAN DEFAULT TRUE" if not is_sqlite else "BOOLEAN DEFAULT 1"),
                    ("is_recording", "BOOLEAN DEFAULT TRUE" if not is_sqlite else "BOOLEAN DEFAULT 1"),
                    ("recording_mode", "VARCHAR DEFAULT 'Continuo (24/7)'"),
                    ("storage_location", "VARCHAR"),
                    ("has_video_signal", "BOOLEAN DEFAULT TRUE" if not is_sqlite else "BOOLEAN DEFAULT 1"),
                    ("audio_enabled", "BOOLEAN DEFAULT FALSE" if not is_sqlite else "BOOLEAN DEFAULT 0"),
                ]
                for col_name, col_type in camera_cols:
                    if col_name not in existing_cols:
                        try:
                            conn.execute(text(f"ALTER TABLE camera ADD COLUMN {col_name} {col_type}"))
                            conn.commit()
                            print(f"[DB Schema] Columna agregada: camera.{col_name}")
                        except Exception as ex:
                            print(f"[DB Schema Warning] camera.{col_name}: {ex}")

            # 2. Migrar tabla 'device'
            if 'device' in tables:
                existing_dev_cols = {col['name'] for col in inspector.get_columns('device')}
                dev_cols = [
                    ("storage_media_type", "VARCHAR DEFAULT 'HDD SATA'"),
                    ("hdd_status", "VARCHAR DEFAULT 'Normal (Formato OK)'"),
                    ("hdd_capacity_total_gb", "DOUBLE PRECISION" if not is_sqlite else "FLOAT"),
                    ("hdd_capacity_free_gb", "DOUBLE PRECISION" if not is_sqlite else "FLOAT"),
                    ("device_time", "TIMESTAMP WITHOUT TIME ZONE" if not is_sqlite else "DATETIME"),
                    ("time_offset_seconds", "INTEGER DEFAULT 0"),
                    ("time_synced_at", "TIMESTAMP WITHOUT TIME ZONE" if not is_sqlite else "DATETIME"),
                ]
                for col_name, col_type in dev_cols:
                    if col_name not in existing_dev_cols:
                        try:
                            conn.execute(text(f"ALTER TABLE device ADD COLUMN {col_name} {col_type}"))
                            conn.commit()
                            print(f"[DB Schema] Columna agregada: device.{col_name}")
                        except Exception as ex:
                            print(f"[DB Schema Warning] device.{col_name}: {ex}")

            # 3. Migrar tabla 'auditreport'
            if 'auditreport' in tables:
                existing_audit_cols = {col['name'] for col in inspector.get_columns('auditreport')}
                audit_cols = [
                    ("installed_cameras", "INTEGER DEFAULT 0"),
                    ("recording_cameras", "INTEGER DEFAULT 0"),
                    ("devices_count", "INTEGER DEFAULT 0"),
                    ("pdf_filename", "VARCHAR DEFAULT ''"),
                    ("technician_signed", "BOOLEAN DEFAULT FALSE" if not is_sqlite else "BOOLEAN DEFAULT 0"),
                    ("technician_signed_by", "VARCHAR"),
                    ("technician_username", "VARCHAR"),
                    ("technician_signed_at", "TIMESTAMP WITHOUT TIME ZONE" if not is_sqlite else "DATETIME"),
                    ("technician_hash", "VARCHAR"),
                    ("coordinator_signed", "BOOLEAN DEFAULT FALSE" if not is_sqlite else "BOOLEAN DEFAULT 0"),
                    ("coordinator_signed_by", "VARCHAR"),
                    ("coordinator_username", "VARCHAR"),
                    ("coordinator_signed_at", "TIMESTAMP WITHOUT TIME ZONE" if not is_sqlite else "DATETIME"),
                    ("coordinator_hash", "VARCHAR"),
                    ("status", "VARCHAR DEFAULT 'pending'"),
                    ("notes", "TEXT" if not is_sqlite else "VARCHAR"),
                    ("rejection_reason", "TEXT" if not is_sqlite else "VARCHAR"),
                    ("rejected_by", "VARCHAR"),
                    ("rejected_at", "TIMESTAMP WITHOUT TIME ZONE" if not is_sqlite else "DATETIME"),
                    ("report_data_json", "TEXT" if not is_sqlite else "VARCHAR"),
                ]
                for col_name, col_type in audit_cols:
                    if col_name not in existing_audit_cols:
                        try:
                            conn.execute(text(f"ALTER TABLE auditreport ADD COLUMN {col_name} {col_type}"))
                            conn.commit()
                            print(f"[DB Schema] Columna agregada: auditreport.{col_name}")
                        except Exception as ex:
                            print(f"[DB Schema Warning] auditreport.{col_name}: {ex}")

    except Exception as e:
        print(f"[DB Schema Init Error] {e}")

def get_session():
    with Session(engine) as session:
        yield session

