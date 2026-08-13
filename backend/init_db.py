from sqlmodel import SQLModel, Session, select
from app.db.session import engine
from app.models.models import User, UserRole, Device, Camera, ViewGroup, Report
from app.core import security

def init_db():
    print("Creando tablas en la base de datos...")
    SQLModel.metadata.create_all(engine)
    print("Tablas creadas con éxito.")

    with Session(engine) as session:
        admin_user = session.exec(select(User).where(User.username == "admin")).first()
        if not admin_user:
            print("Creando usuario inicial 'admin'...")
            admin_user = User(
                username="admin",
                full_name="Administrador del Sistema",
                hashed_password=security.get_password_hash("M1un1c4cl4v3"),
                role=UserRole.ADMIN,
                is_active=True
            )
            session.add(admin_user)
            session.commit()
            print("Usuario 'admin' creado con éxito.")
        else:
            print("Actualizando contraseña de usuario 'admin'...")
            admin_user.hashed_password = security.get_password_hash("M1un1c4cl4v3")
            admin_user.role = UserRole.ADMIN
            admin_user.is_active = True
            session.add(admin_user)
            session.commit()
            print("Usuario 'admin' actualizado con la nueva contraseña.")

if __name__ == "__main__":
    init_db()

