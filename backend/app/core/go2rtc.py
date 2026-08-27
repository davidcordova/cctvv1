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
                if camera.rtsp_url:
                    main_url = camera.rtsp_url.split("#")[0]
                    device = devices_by_id.get(camera.device_id)
                    is_dvr = (
                        device 
                        and str(device.device_type).upper() in ("DVR", "NVR") 
                        and (device.channel_count or 1) > 1 
                        and device.host != "192.168.2.36"
                        and "ezviz" not in str(device.brand).lower()
                    )

                    if is_dvr and device.password:
                        sub_url = generate_substream_url(
                            device.host,
                            device.username,
                            device.password,
                            camera.channel,
                            device.brand
                        ).split("#")[0]
                        streams[f"camera_{camera.id}"] = sub_url
                        streams[f"camera_{camera.id}_hd"] = main_url
                    elif device and "ezviz" in str(device.brand).lower():
                        # Cámaras Ezviz (ej. H6c, C6N, H8c, H3c): Probar URL directa y variantes de streaming estándar
                        user_enc = urllib.parse.quote(device.username or "admin", safe="")
                        pass_enc = urllib.parse.quote(device.password or "", safe="")
                        ezviz_sources = [
                            main_url,
                            f"rtsp://{user_enc}:{pass_enc}@{device.host}:554/Streaming/Channels/101",
                            f"rtsp://{user_enc}:{pass_enc}@{device.host}:554/h264/ch1/main/av_stream",
                            f"isapi://{user_enc}:{pass_enc}@{device.host}:{device.port or 80}/"
                        ]
                        seen_s = set()
                        uniq_ezviz = [s for s in ezviz_sources if not (s in seen_s or seen_s.add(s))]
                        streams[f"camera_{camera.id}"] = uniq_ezviz
                        streams[f"camera_{camera.id}_hd"] = uniq_ezviz
                    else:
                        streams[f"camera_{camera.id}"] = main_url
                        streams[f"camera_{camera.id}_hd"] = main_url
        
        candidates = get_local_ip_candidates()
        import shutil
        ffmpeg_bin = shutil.which("ffmpeg") or "ffmpeg"

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
            "ffmpeg": {
                "bin": ffmpeg_bin
            },
            "streams": streams
        }
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(config, f, default_flow_style=False)
        print(f"go2rtc config synced with {len(streams)} active streams and LAN candidates {candidates} to {config_path}.")

        # Notificar y registrar streams dinámicamente en go2rtc si ya se encuentra en ejecución
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get("http://localhost:1984/api/streams")
                if res.status_code == 200:
                    for src_name, rtsp_entry in streams.items():
                        if isinstance(rtsp_entry, list):
                            for s in rtsp_entry:
                                client.put("http://localhost:1984/api/streams", params={"src": s, "name": src_name})
                        else:
                            client.put("http://localhost:1984/api/streams", params={"src": rtsp_entry, "name": src_name})
        except Exception as e:
            print(f"Notice: could not dynamically update go2rtc via API: {e}")

    except Exception as e:
        print(f"Error syncing go2rtc config: {e}")

GO2RTC_WATCHDOG_RUNNING = False
WATCHDOG_THREAD = None

def _watchdog_loop(binary_path, config_path):
    global GO2RTC_PROC, GO2RTC_WATCHDOG_RUNNING
    log_path = os.path.join(os.path.dirname(binary_path), "go2rtc.log")
    while GO2RTC_WATCHDOG_RUNNING:
        if GO2RTC_PROC is None or GO2RTC_PROC.poll() is not None:
            print("go2rtc process not running, restarting...")
            try:
                GO2RTC_PROC = subprocess.Popen(
                    [binary_path, "-config", config_path],
                    stdout=open(log_path, "a"),
                    stderr=subprocess.STDOUT,
                    cwd=os.path.dirname(binary_path)
                )
                print("go2rtc restarted by watchdog!")
            except Exception as e:
                print(f"Watchdog failed to restart go2rtc: {e}")
        time.sleep(2)

def start_go2rtc():
    global GO2RTC_PROC, GO2RTC_WATCHDOG_RUNNING, WATCHDOG_THREAD
    binary_path, config_path = get_go2rtc_paths()
    if not os.path.exists(binary_path):
        print(f"go2rtc.exe not found at {binary_path}. Running without WebRTC streaming.")
        return
        
    sync_go2rtc_config()
    log_path = os.path.join(os.path.dirname(binary_path), "go2rtc.log")
    
    print("Starting go2rtc process...")
    try:
        GO2RTC_PROC = subprocess.Popen(
            [binary_path, "-config", config_path],
            stdout=open(log_path, "w"),
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
