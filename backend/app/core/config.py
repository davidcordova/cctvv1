import os
import sys
from typing import Optional
from pydantic_settings import BaseSettings

def get_default_db_url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        test_file = os.path.join(exe_dir, ".test_write")
        is_writable = False
        try:
            with open(test_file, "w") as f:
                f.write("1")
            os.remove(test_file)
            is_writable = True
        except Exception:
            is_writable = False

        if is_writable:
            db_path = os.path.join(exe_dir, "sql_app.db")
        else:
            base_dir = os.environ.get("PROGRAMDATA") or os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or exe_dir
            app_data_dir = os.path.join(base_dir, "Sistema_CCTV")
            os.makedirs(app_data_dir, exist_ok=True)
            db_path = os.path.join(app_data_dir, "sql_app.db")
    else:
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        if os.path.exists(os.path.join(root_dir, "sql_app.db")):
            db_path = os.path.join(root_dir, "sql_app.db")
        else:
            db_path = os.path.join(backend_dir, "sql_app.db")
        
    return f"sqlite:///{db_path.replace(os.sep, '/')}"

class Settings(BaseSettings):
    PROJECT_NAME: str = "CCTV Management System"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "supersecretkey" # Change in production
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    
    # Database
    DATABASE_URL: str = get_default_db_url()

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
