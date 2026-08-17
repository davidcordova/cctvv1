from sqlalchemy import text
from app.db.session import engine

def run_migration():
    print("Iniciando migración para inventario de puertos y cámaras instaladas...")
    with engine.connect() as conn:
        # 1. Agregar columna is_installed a camera
        conn.execute(text("ALTER TABLE camera ADD COLUMN IF NOT EXISTS is_installed BOOLEAN DEFAULT TRUE"))
        
        # 2. Configurar puertos sin cámara / libres
        conn.execute(text("""
            UPDATE camera 
            SET is_installed = FALSE,
                is_active = FALSE,
                is_recording = FALSE,
                recording_mode = 'Puerto Libre / Sin Cámara'
            WHERE (is_active = FALSE AND is_recording = FALSE)
               OR LOWER(name) LIKE '%sin camara%'
               OR LOWER(name) LIKE '%801 -%'
               OR LOWER(name) LIKE '%701 -%'
               OR LOWER(name) LIKE '%601 -%'
               OR LOWER(name) LIKE '%401 -%'
               OR LOWER(name) LIKE '%301 -%'
               OR LOWER(name) LIKE '%101 -%';
        """))
        
        # 3. Asegurar cámaras instaladas
        conn.execute(text("""
            UPDATE camera
            SET is_installed = TRUE
            WHERE is_active = TRUE OR is_recording = TRUE;
        """))

        conn.commit()

        # Estadísticas
        res_inst = conn.execute(text("SELECT COUNT(*) FROM camera WHERE is_installed = TRUE")).scalar()
        res_free = conn.execute(text("SELECT COUNT(*) FROM camera WHERE is_installed = FALSE")).scalar()
        res_rec = conn.execute(text("SELECT COUNT(*) FROM camera WHERE is_installed = TRUE AND is_recording = TRUE")).scalar()

    print(f"¡Migración completada con éxito!\n- Cámaras Instaladas / En Servicio: {res_inst}\n- Puertos Libres / En Reserva: {res_free}\n- Cámaras Grabando Activas: {res_rec}")

if __name__ == "__main__":
    run_migration()
