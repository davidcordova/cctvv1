import asyncio
import os
import sys
import webbrowser
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from app.api.api import api_router
from app.core.config import settings
from app.db.session import engine
from app.models.models import SQLModel, Device, Report


async def check_connectivity(host: str, port: int) -> bool:
    ports_to_try = [port, 80, 8000, 554]
    seen = set()
    ports_to_try = [p for p in ports_to_try if not (p in seen or seen.add(p))]

    for p in ports_to_try:
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, p),
                timeout=2.0
            )
            writer.close()
            await writer.wait_closed()
            return True
        except Exception:
            pass
    return False


async def _check_single_device(device: Device):
    from app.core.hikvision import HikvisionDriver
    from datetime import datetime
    is_now_online = await check_connectivity(device.host, device.port)
    time_info = None
    storage_info = None

    if is_now_online:
        try:
            driver = HikvisionDriver(device)
            # Consultar hora y almacenamiento con timeout protegido
            time_info = await asyncio.wait_for(driver.get_device_time(), timeout=3.0)
            storage_info = await asyncio.wait_for(driver.get_storage_status(), timeout=3.0)
        except Exception:
            pass

    return device, is_now_online, time_info, storage_info


async def monitor_devices_loop():
    await asyncio.sleep(3)
    from datetime import datetime
    while True:
        try:
            # 1. Obtener lista de dispositivos
            with Session(engine) as session:
                devices = session.exec(select(Device)).all()
                device_copies = [Device(**d.model_dump()) for d in devices]

            if device_copies:
                results = await asyncio.gather(
                    *[_check_single_device(d) for d in device_copies],
                    return_exceptions=True
                )
                
                # 2. Guardar cambios en BD en una sesión breve
                with Session(engine) as session:
                    for res in results:
                        if isinstance(res, Exception):
                            continue
                        device, is_now_online, time_info, storage_info = res
                        db_device = session.get(Device, device.id)
                        if not db_device:
                            continue

                        # Cambios de estado online/offline
                        if is_now_online != db_device.is_online:
                            db_device.is_online = is_now_online
                            report = Report(
                                device_id=db_device.id,
                                event_type="Conexión" if is_now_online else "Desconexión",
                                description=f"El grabador {db_device.name} ({db_device.host}) está {'en línea' if is_now_online else 'fuera de línea'}.",
                                severity="info" if is_now_online else "error"
                            )
                            session.add(report)

                        # Actualizar métricas reales de tiempo
                        if time_info and is_now_online:
                            prev_offset = db_device.time_offset_seconds or 0
                            new_offset = time_info.get("offset_seconds", 0)
                            db_device.time_offset_seconds = new_offset
                            try:
                                db_device.device_time = datetime.fromisoformat(time_info.get("device_time", ""))
                            except Exception:
                                pass

                            # Si el desfase superó los 5 minutos y antes no estaba reportado
                            if abs(new_offset) > 300 and abs(prev_offset) <= 300:
                                report_drift = Report(
                                    device_id=db_device.id,
                                    event_type="Desfase Horario",
                                    description=f"Se detectó desfase horario crítico en {db_device.name}: {round(new_offset/60)} min respecto al servidor.",
                                    severity="warning"
                                )
                                session.add(report_drift)

                        # Actualizar almacenamiento real
                        if storage_info and is_now_online:
                            db_device.hdd_status = storage_info.get("hdd_status", db_device.hdd_status)
                            db_device.hdd_capacity_total_gb = storage_info.get("total_gb", db_device.hdd_capacity_total_gb)
                            db_device.hdd_capacity_free_gb = storage_info.get("free_gb", db_device.hdd_capacity_free_gb)

                        session.add(db_device)
                    session.commit()
        except Exception as e:
            print(f"Error in device monitoring loop: {e}")
        await asyncio.sleep(30)



@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    monitor_task = None
    try:
        SQLModel.metadata.create_all(engine)
        print("Database tables created successfully")
        # Asegurar existencia del usuario admin por defecto
        from app.models.models import User, UserRole
        from app.core import security
        with Session(engine) as session:
            admin_user = session.exec(select(User).where(User.username == "admin")).first()
            if not admin_user:
                admin_user = User(
                    username="admin",
                    full_name="Administrador del Sistema",
                    hashed_password=security.get_password_hash("admin"),
                    role=UserRole.ADMIN,
                    is_active=True
                )
                session.add(admin_user)
                session.commit()
                print("Default admin user created (admin/admin)")

            # Limpieza automática de canales huérfanos / excedentes
            from app.models.models import Camera, UserCameraLink
            all_devices = session.exec(select(Device)).all()
            cleaned = False
            for dev in all_devices:
                max_ch = dev.channel_count or 1
                excess = session.exec(select(Camera).where(Camera.device_id == dev.id, Camera.channel > max_ch)).all()
                for c in excess:
                    if c.id:
                        links = session.exec(select(UserCameraLink).where(UserCameraLink.camera_id == c.id)).all()
                        for l in links:
                            session.delete(l)
                    session.delete(c)
                    cleaned = True
            if cleaned:
                session.commit()
                print("Canales excedentes purgados correctamente.")

        monitor_task = asyncio.create_task(monitor_devices_loop())
    except Exception as e:
        print(f"Error creating database tables or admin user: {e}")


    try:
        from app.core.go2rtc import start_go2rtc
        start_go2rtc()
    except Exception as e:
        print(f"Error starting go2rtc: {e}")

    yield

    # Shutdown
    if monitor_task:
        monitor_task.cancel()
    try:
        from app.core.go2rtc import stop_go2rtc
        stop_go2rtc()
    except Exception as e:
        print(f"Error stopping go2rtc: {e}")


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            response = await super().get_response(path, scope)
            if response.status_code == 404:
                return await super().get_response("index.html", scope)
            return response
        except Exception:
            return await super().get_response("index.html", scope)


# Servir archivos estáticos del frontend (dist / static) en producción
if getattr(sys, 'frozen', False):
    static_dir = os.path.join(sys._MEIPASS, "static")
    if not os.path.exists(static_dir):
        exec_dir = os.path.dirname(sys.executable)
        static_dir = os.path.join(exec_dir, "static")
else:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    static_dir = os.path.join(base_dir, "static")
    if not os.path.exists(static_dir):
        static_dir = os.path.join(os.path.dirname(base_dir), "frontend", "dist")

if os.path.exists(static_dir):
    app.mount("/", SPAStaticFiles(directory=static_dir, html=True), name="static")
else:
    @app.get("/")
    def root():
        return {"message": "Welcome to CCTV Management System API"}

if __name__ == "__main__":
    import uvicorn
    # Abrir navegador automáticamente tras iniciar sólo si no está en modo headless/servicio
    no_browser = "--no-browser" in sys.argv or os.environ.get("CCTV_NO_BROWSER") == "1"
    if not no_browser:
        def open_browser():
            import time
            time.sleep(1.5)
            webbrowser.open("http://localhost:8500")

        import threading
        threading.Thread(target=open_browser, daemon=True).start()

    print("Iniciando Servidor CCTV en http://0.0.0.0:8500...")
    uvicorn.run("app.main:app" if not getattr(sys, 'frozen', False) else app, host="0.0.0.0", port=8500, log_level="info")


