import httpx
from typing import List, Dict, Optional

class EzvizDriver:
    def __init__(self, app_key: str, app_secret: str):
        self.app_key = app_key
        self.app_secret = app_secret
        self.base_url = "https://open.ys7.com/api/lapp"
        self.token = None

    async def get_token(self) -> str:
        """Obtiene el token de acceso de la plataforma Ezviz Open."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/token/get",
                data={"appKey": self.app_key, "appSecret": self.app_secret}
            )
            data = response.json()
            if data["code"] == "200":
                self.token = data["data"]["accessToken"]
                return self.token
            raise Exception(f"Error Ezviz: {data['msg']}")

    async def get_device_list(self) -> List[Dict]:
        """Obtiene la lista de dispositivos vinculados a la cuenta."""
        if not self.token:
            await self.get_token()
            
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/device/list",
                data={"accessToken": self.token}
            )
            return response.json()["data"]
