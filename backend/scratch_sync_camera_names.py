import sys
sys.path.append('app')
from sqlmodel import Session, select
from app.db.session import engine
from app.models.models import Camera, Device

def fix_camera_names():
    with Session(engine) as session:
        cameras = session.exec(select(Camera)).all()
        updated_count = 0
        for camera in cameras:
            device = session.get(Device, camera.device_id)
            if device:
                if " - " in camera.name:
                    parts = camera.name.split(" - ")
                    # Replace the last part with the current device name
                    parts[-1] = device.name
                    new_name = " - ".join(parts)
                    if camera.name != new_name:
                        print(f"Updating camera name: '{camera.name}' -> '{new_name}'")
                        camera.name = new_name
                        session.add(camera)
                        updated_count += 1
        session.commit()
        print(f"Successfully updated {updated_count} cameras.")

if __name__ == "__main__":
    fix_camera_names()
