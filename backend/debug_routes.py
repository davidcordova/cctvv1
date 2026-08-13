from app.main import app
from fastapi.routing import APIRoute

def list_routes(routes, prefix=""):
    for route in routes:
        if isinstance(route, APIRoute):
            print(f"Path: {prefix}{route.path}, Methods: {route.methods}")
        elif hasattr(route, "routes"):
            new_prefix = prefix + getattr(route, "path", "")
            list_routes(route.routes, new_prefix)

list_routes(app.routes)
