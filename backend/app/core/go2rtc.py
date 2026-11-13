import sys
import os
import time
import threading
import yaml
import subprocess
import urllib.parse
from sqlmodel import Session, select
from app.db.session import engine
from app.models.models import Camera

GO2RTC_PROC = None

def get_ffmpeg_path() -> str:
    """Busca el ejecutable de ffmpeg en el directorio del ejecutable, backend o PATH del sistema."""
    import shutil
    candidates = []
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
        candidates.append(os.path.join(base_dir, "ffmpeg.exe"))
        if hasattr(sys, '_MEIPASS'):
            candidates.append(os.path.join(sys._MEIPASS, "ffmpeg.exe"))
    
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    candidates.append(os.path.join(backend_dir, "ffmpeg.exe"))
    candidates.append(os.path.join(backend_dir, "bin", "ffmpeg.exe"))
    candidates.append(os.path.join(os.path.dirname(backend_dir), "ffmpeg.exe"))
    candidates.append(os.path.join(os.path.dirname(backend_dir), "dist", "cctv_backend", "ffmpeg.exe"))
    
    for c in candidates:
        if os.path.exists(c):
            return os.path.abspath(c)
            
    which_path = shutil.which("ffmpeg")
    if which_path:
        return which_path
        
    return ""


def get_go2rtc_paths():
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
        binary_path = os.path.join(base_dir, "go2rtc.exe")
        if not os.path.exists(binary_path) and hasattr(sys, '_MEIPASS'):
            binary_path = os.path.join(sys._MEIPASS, "go2rtc.exe")
        config_path = os.path.join(base_dir, "go2rtc.yaml")
        if not os.path.exists(config_path) and hasattr(sys, '_MEIPASS'):
            config_path = os.path.join(sys._MEIPASS, "go2rtc.yaml")
    else:
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        binary_path = os.path.join(backend_dir, "go2rtc.exe")
        config_path = os.path.join(backend_dir, "go2rtc.yaml")
    return binary_path, config_path

import httpx
import socket
from app.models.models import Device
from app.core.hikvision import generate_substream_url


def get_local_ip_candidates():
    """Descubre las direcciones IP locales IPv4 del servidor para acelerar la negociación WebRTC LAN."""
    candidates = ["stun:8555"]
    try:
        hostname = socket.gethostname()
        addrs = socket.getaddrinfo(hostname, None)
        for addr in addrs:
            ip = addr[4][0]
            if ":" not in ip and not ip.startswith("127.") and not ip.startswith("169.254."):
                candidates.append(f"{ip}:8555")
    except Exception:
        pass
    return list(dict.fromkeys(candidates))


def sync_go2rtc_config():
    try:
        binary_path, config_path = get_go2rtc_paths()
        streams = {}
        with Session(engine) as session:
            cameras = session.exec(select(Camera).where(Camera.rtsp_url != None)).all()
            # Mapear dispositivos en memoria para optimizar consultas
            devices_by_id = {d.id: d for d in session.exec(select(Device)).all()}

            for camera in cameras:
                if not camera.rtsp_url:
                    continue
                if not getattr(camera, "is_active", True) or not getattr(camera, "is_installed", True):
                    continue

                main_url = camera.rtsp_url.split("#")[0]
                device = devices_by_id.get(camera.device_id)

                # Generar URL de Substream (SD / Fluido / Ligero)
                sub_url = None
                if device and device.password:
                    try:
                        sub_url = generate_substream_url(
                            device.host,
                            device.username,
                            device.password,
                            camera.channel,
                            device.brand
                        ).split("#")[0]
                    except Exception:
                        sub_url = None

                # Fallback heurístico si no se pudo generar desde el dispositivo
                if not sub_url or sub_url == main_url:
                    if "/Channels/" in main_url and main_url.endswith("01"):
                        sub_url = main_url[:-2] + "02"
                    elif "subtype=0" in main_url:
                        sub_url = main_url.replace("subtype=0", "subtype=1")
                    else:
                        sub_url = main_url

                # 1. Flujo SD (Ligero para Muro y modo SD): Substream + fallback H.264 bajo demanda si el navegador no soporta H.265
                if sub_url and sub_url != main_url:
                    streams[f"camera_{camera.id}"] = [
                        sub_url,
                        main_url,
                        f"ffmpeg:camera_{camera.id}#video=h264"
                    ]
                else:
                    streams[f"camera_{camera.id}"] = [
                        main_url,
                        f"ffmpeg:camera_{camera.id}#video=h264"
                    ]

                # 2. Flujo HD (Alta Definición para Zoom): Mainstream + FFmpeg H.264 fallback si la cámara emite H.265
                streams[f"camera_{camera.id}_hd"] = [
                    main_url,
                    f"ffmpeg:camera_{camera.id}_hd#video=h264"
                ]

                # 3. Flujo Talk (Intercomunicador / Audio bidireccional)
                streams[f"camera_{camera.id}_talk"] = [
                    f"{main_url}#backchannel=1",
                    main_url
                ]
        
        candidates = get_local_ip_candidates()
        ffmpeg_bin = get_ffmpeg_path()

        config = {
            "api": {
                "listen": ":1984",
                "origin": "*"
            },
            "rtsp": {
                "listen": ":8554"
            },
            "webrtc": {
                "listen": ":8555",
                "candidates": candidates
            },
            "streams": streams
        }
        if ffmpeg_bin:
            config["ffmpeg"] = {"bin": ffmpeg_bin}

        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(config, f, default_flow_style=False)
        print(f"go2rtc config synced with {len(streams)} active streams and LAN candidates {candidates} to {config_path}.")

        # Notificar y registrar streams dinámicamente en go2rtc si ya se encuentra en ejecución
        try:
            with httpx.Client(timeout=2.0) as client:
                res = client.get("http://127.0.0.1:1984/api/streams")
                if res.status_code == 200:
                    try:
                        existing = res.json() if isinstance(res.json(), dict) else {}
                        for old_name in list(existing.keys()):
                            if old_name.startswith("camera_") and old_name not in streams:
                                client.delete("http://127.0.0.1:1984/api/streams", params={"src": old_name})
                    except Exception:
                        pass

                    for src_name, rtsp_entry in streams.items():
                        if isinstance(rtsp_entry, list):
                            params = [("name", src_name)] + [("src", s) for s in rtsp_entry]
                            client.put("http://127.0.0.1:1984/api/streams", params=params)
                        else:
                            client.put("http://127.0.0.1:1984/api/streams", params={"src": rtsp_entry, "name": src_name})
        except (httpx.ConnectError, httpx.ConnectTimeout):
            # Normal durante el arranque inicial antes de que el proceso go2rtc.exe inicie
            pass
        except Exception as e:
            print(f"Notice: could not dynamically update go2rtc via API: {e}")

    except Exception as e:
        print(f"Error syncing go2rtc config: {e}")

GO2RTC_WATCHDOG_RUNNING = False
WATCHDOG_THREAD = None
GO2RTC_LOG_HANDLE = None


def _close_log_handle():
    global GO2RTC_LOG_HANDLE
    if GO2RTC_LOG_HANDLE is not None:
        try:
            GO2RTC_LOG_HANDLE.close()
        except Exception:
            pass
        GO2RTC_LOG_HANDLE = None


def _watchdog_loop(binary_path, config_path):
    global GO2RTC_PROC, GO2RTC_WATCHDOG_RUNNING, GO2RTC_LOG_HANDLE
    log_path = os.path.join(os.path.dirname(binary_path), "go2rtc.log")
    while GO2RTC_WATCHDOG_RUNNING:
        if GO2RTC_PROC is None or GO2RTC_PROC.poll() is not None:
            print("go2rtc process not running, restarting...")
            try:
                _close_log_handle()
                GO2RTC_LOG_HANDLE = open(log_path, "a", encoding="utf-8", errors="ignore")
                GO2RTC_PROC = subprocess.Popen(
                    [binary_path, "-config", config_path],
                    stdout=GO2RTC_LOG_HANDLE,
                    stderr=subprocess.STDOUT,
                    cwd=os.path.dirname(binary_path)
                )
                print("go2rtc restarted by watchdog!")
            except Exception as e:
                print(f"Watchdog failed to restart go2rtc: {e}")
        time.sleep(2)

def start_go2rtc():
    global GO2RTC_PROC, GO2RTC_WATCHDOG_RUNNING, WATCHDOG_THREAD, GO2RTC_LOG_HANDLE
    binary_path, config_path = get_go2rtc_paths()
    if not os.path.exists(binary_path):
        print(f"go2rtc.exe not found at {binary_path}. Running without WebRTC streaming.")
        return
        
    sync_go2rtc_config()
    log_path = os.path.join(os.path.dirname(binary_path), "go2rtc.log")
    
    print("Starting go2rtc process...")
    try:
        _close_log_handle()
        GO2RTC_LOG_HANDLE = open(log_path, "w", encoding="utf-8", errors="ignore")
        GO2RTC_PROC = subprocess.Popen(
            [binary_path, "-config", config_path],
            stdout=GO2RTC_LOG_HANDLE,
            stderr=subprocess.STDOUT,
            cwd=os.path.dirname(binary_path)
        )
        print("go2rtc started successfully!")
    except Exception as e:
        print(f"Failed to start go2rtc: {e}")

    # Iniciar watchdog de auto-recuperación
    if not GO2RTC_WATCHDOG_RUNNING:
        GO2RTC_WATCHDOG_RUNNING = True
        import threading
        WATCHDOG_THREAD = threading.Thread(target=_watchdog_loop, args=(binary_path, config_path), daemon=True)
        WATCHDOG_THREAD.start()

def stop_go2rtc():
    global GO2RTC_PROC, GO2RTC_WATCHDOG_RUNNING
    GO2RTC_WATCHDOG_RUNNING = False
    if GO2RTC_PROC:
        print("Stopping go2rtc process...")
        try:
            GO2RTC_PROC.terminate()
            GO2RTC_PROC.wait(timeout=3)
            print("go2rtc stopped.")
        except Exception as e:
            print(f"Error stopping go2rtc: {e}")
    _close_log_handle()
