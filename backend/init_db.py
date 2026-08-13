from sqlmodel import SQLModel
from app.db.session import engine
from app.models.models import User, Device, Camera, ViewGroup, Report

def init_db():
    print("Creando tablas en la base de datos...")
    SQLModel.metadata.create_all(engine)
    print("Tablas creadas con éxito.")

if __name__ == "__main__":
    init_db()
