import sys
import os
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

def sync_go2rtc_config():
    try:
        binary_path, config_path = get_go2rtc_paths()
        streams = {}
        with Session(engine) as session:
            cameras = session.exec(select(Camera).where(Camera.is_active == True)).all()
            for camera in cameras:
                if camera.rtsp_url:
                    streams[f"camera_{camera.id}"] = camera.rtsp_url
        
        config = {"streams": streams}
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(config, f, default_flow_style=False)
        print(f"go2rtc config synced with {len(streams)} active streams.")

        # Notificar a go2rtc si ya se encuentra en ejecución
        try:
            with httpx.Client(timeout=0.5) as client:
                res = client.get("http://localhost:1984/api/streams")
                if res.status_code == 200:
                    for src_name, rtsp_url in streams.items():
                        client.put(f"http://localhost:1984/api/streams?src={src_name}&val={urllib.parse.quote(rtsp_url, safe='')}")
        except Exception:
            pass

    except Exception as e:
        print(f"Error syncing go2rtc config: {e}")

def start_go2rtc():
    global GO2RTC_PROC
    binary_path, config_path = get_go2rtc_paths()
    if not os.path.exists(binary_path):
        print(f"go2rtc.exe not found at {binary_path}. Running without WebRTC streaming.")
        return
        
    sync_go2rtc_config()
    
    print("Starting go2rtc process...")
    try:
        # Run go2rtc process in background
        GO2RTC_PROC = subprocess.Popen(
            [binary_path, "-config", config_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=os.path.dirname(binary_path)
        )
        print("go2rtc started successfully!")
    except Exception as e:
        print(f"Failed to start go2rtc: {e}")

def stop_go2rtc():
    global GO2RTC_PROC
    if GO2RTC_PROC:
        print("Stopping go2rtc process...")
        try:
            GO2RTC_PROC.terminate()
            GO2RTC_PROC.wait(timeout=3)
            print("go2rtc stopped.")
        except Exception as e:
            print(f"Error stopping go2rtc: {e}")
