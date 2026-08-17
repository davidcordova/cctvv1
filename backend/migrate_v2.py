from sqlalchemy import text
from app.db.session import engine

def run_migration():
    print("Iniciando migración de base de datos para HDD, grabación y sincronización de hora...")
    with engine.connect() as conn:
        # 1. Columnas de Device
        conn.execute(text("ALTER TABLE device ADD COLUMN IF NOT EXISTS hdd_status VARCHAR DEFAULT 'Normal (Formato OK)'"))
        conn.execute(text("ALTER TABLE device ADD COLUMN IF NOT EXISTS hdd_capacity_total_gb FLOAT DEFAULT 2000.0"))
        conn.execute(text("ALTER TABLE device ADD COLUMN IF NOT EXISTS hdd_capacity_free_gb FLOAT DEFAULT 420.0"))
        conn.execute(text("ALTER TABLE device ADD COLUMN IF NOT EXISTS device_time TIMESTAMP"))
        conn.execute(text("ALTER TABLE device ADD COLUMN IF NOT EXISTS time_offset_seconds INTEGER DEFAULT 0"))
        conn.execute(text("ALTER TABLE device ADD COLUMN IF NOT EXISTS time_synced_at TIMESTAMP"))

        # 2. Columnas de Camera
        conn.execute(text("ALTER TABLE camera ADD COLUMN IF NOT EXISTS is_recording BOOLEAN DEFAULT TRUE"))
        conn.execute(text("ALTER TABLE camera ADD COLUMN IF NOT EXISTS recording_mode VARCHAR DEFAULT 'Continuo (24/7)'"))
        conn.execute(text("ALTER TABLE camera ADD COLUMN IF NOT EXISTS has_video_signal BOOLEAN DEFAULT TRUE"))

        # 3. Actualizar valores iniciales de cámaras inactivas para que reflejen consistencia
        conn.execute(text("UPDATE camera SET is_recording = FALSE, recording_mode = 'No Grabando / Deshabilitado', has_video_signal = FALSE WHERE is_active = FALSE"))
        
        conn.commit()
    print("¡Migración completada con éxito!")

if __name__ == "__main__":
    run_migration()
