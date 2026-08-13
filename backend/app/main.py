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
    is_now_online = await check_connectivity(device.host, device.port)
    return device, is_now_online


async def monitor_devices_loop():
    await asyncio.sleep(5)
    while True:
        try:
            with Session(engine) as session:
                devices = session.exec(select(Device)).all()
                if devices:
                    results = await asyncio.gather(
                        *[_check_single_device(d) for d in devices],
                        return_exceptions=True
                    )
                    for res in results:
                        if isinstance(res, Exception):
                            continue
                        device, is_now_online = res
                        if is_now_online != device.is_online:
                            db_device = session.get(Device, device.id)
                            if db_device:
                                db_device.is_online = is_now_online
                                session.add(db_device)

                                report = Report(
                                    device_id=db_device.id,
                                    event_type="Conexión" if is_now_online else "Desconexión",
                                    description=f"El dispositivo {db_device.name} ({db_device.host}) está {'en línea' if is_now_online else 'fuera de línea'}.",
                                    severity="info" if is_now_online else "error"
                                )
                                session.add(report)
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
        monitor_task = asyncio.create_task(monitor_devices_loop())
    except Exception as e:
        print(f"Error creating database tables: {e}")

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
    # Abrir navegador automáticamente tras iniciar
    def open_browser():
        import time
        time.sleep(1.5)
        webbrowser.open("http://localhost:8500")

    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    print("Iniciando Servidor CCTV en http://localhost:8500...")
    uvicorn.run("app.main:app" if not getattr(sys, 'frozen', False) else app, host="0.0.0.0", port=8500, log_level="info")


