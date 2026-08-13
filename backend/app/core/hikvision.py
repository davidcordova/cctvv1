import httpx
import urllib.parse
import xml.etree.ElementTree as ET
from typing import List, Dict, Optional
from app.models.models import Device, Brand


def generate_rtsp_url(host: str, username: str, password: str, channel_id: int, brand: str) -> str:
    """Genera la URL RTSP correspondiente a la marca del dispositivo y número de canal."""
    encoded_user = urllib.parse.quote(username, safe="")
    encoded_pass = urllib.parse.quote(password, safe="")

    brand_str = str(brand).lower()
    if "dahua" in brand_str:
        # Formato Dahua: /cam/realmonitor?channel=1&subtype=0
        chan_num = channel_id
        if chan_num >= 100 and chan_num % 100 == 1:
            chan_num = chan_num // 100
        return f"rtsp://{encoded_user}:{encoded_pass}@{host}:554/cam/realmonitor?channel={chan_num}&subtype=0"
    else:
        # Formato Hikvision / Ezviz / HiLook / Uniview / Genérico: /Streaming/Channels/101
        chan_str = str(channel_id)
        if not chan_str.endswith("01") and channel_id < 100:
            chan_str = f"{channel_id}01"
        return f"rtsp://{encoded_user}:{encoded_pass}@{host}:554/Streaming/Channels/{chan_str}"


class HikvisionDriver:
    def __init__(self, device: Device):
        self.device = device
        # Determinar lista de puertos HTTP probables (si indicaron puerto SDK 8000, probar 80 primero)
        if device.port == 8000:
            self.http_ports = [80, 8080, 8000]
        else:
            self.http_ports = [device.port, 80, 8080]
        # Quitar duplicados manteniendo orden
        seen = set()
        self.http_ports = [p for p in self.http_ports if not (p in seen or seen.add(p))]

        self.auth_digest = httpx.DigestAuth(device.username, device.password)
        self.auth_basic = httpx.BasicAuth(device.username, device.password)

    async def _fetch_url(self, client: httpx.AsyncClient, method: str, url: str, **kwargs) -> httpx.Response:
        """Intenta realizar la petición HTTP probando DigestAuth y luego BasicAuth."""
        try:
            res = await client.request(method, url, auth=self.auth_digest, **kwargs)
            if res.status_code != 401:
                return res
        except Exception:
            pass
        return await client.request(method, url, auth=self.auth_basic, **kwargs)

    async def _fetch(self, client: httpx.AsyncClient, method: str, path: str, **kwargs) -> httpx.Response:
        """Intenta la petición en los puertos HTTP disponibles."""
        last_exception = None
        for port in self.http_ports:
            url = f"http://{self.device.host}:{port}/ISAPI{path}"
            try:
                res = await self._fetch_url(client, method, url, **kwargs)
                if res.status_code < 500:
                    return res
            except Exception as e:
                last_exception = e
        if last_exception:
            raise last_exception
        raise ConnectionError(f"No se pudo conectar a {self.device.host} en ningún puerto ISAPI ({self.http_ports})")

    async def get_device_info(self) -> Dict:
        """Obtiene información básica del dispositivo."""
        async with httpx.AsyncClient(timeout=1.5) as client:
            response = await self._fetch(client, "GET", "/System/deviceInfo")
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "")
            if "xml" in content_type or response.text.startswith("<?xml"):
                root = ET.fromstring(response.text)
                namespace = ""
                if "}" in root.tag:
                    namespace = root.tag.split("}")[0] + "}"

                info = {}
                for child in root:
                    tag = child.tag.replace(namespace, "")
                    info[tag] = child.text
                return info
            return response.json()

    async def get_channels(self) -> List[Dict]:
        """Obtiene la lista de canales/cámaras disponibles probando múltiples endpoints ISAPI de NVR/DVR."""
        async with httpx.AsyncClient(timeout=1.5) as client:
            endpoints = [
                "/Streaming/channels",
                "/ContentMgmt/InputProxy/channels",
                "/System/Video/inputs/channels"
            ]

            for endpoint in endpoints:
                try:
                    response = await self._fetch(client, "GET", endpoint)
                    if response.status_code == 200:
                        channels = self._parse_channels_xml(response.text)
                        if channels:
                            return channels
                except Exception as e:
                    print(f"Error fetching channels from {endpoint}: {e}")

            return []

    def _parse_channels_xml(self, xml_text: str) -> List[Dict]:
        """Parsea las respuestas XML de canales de Hikvision/Ezviz omitiendo sub-streams."""
        try:
            root = ET.fromstring(xml_text)
            channels = []
            seen_ids = set()

            for elem in root.findall(".//*"):
                clean_tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
                if clean_tag in ("StreamingChannel", "InputProxyChannel", "VideoInputChannel"):
                    id_val = None
                    name_val = None
                    for child in elem:
                        c_tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                        if c_tag == "id" and child.text:
                            id_val = child.text.strip()
                        elif c_tag in ("channelName", "name") and child.text:
                            name_val = child.text.strip()

                    if id_val and id_val.isdigit():
                        val = int(id_val)
                        if val >= 100:
                            if val % 100 != 1:
                                continue
                            chan_num = val // 100
                        else:
                            chan_num = val

                        if chan_num not in seen_ids:
                            seen_ids.add(chan_num)
                            chan_name = name_val if name_val and name_val != str(id_val) else f"Cámara {chan_num}"
                            channels.append({"id": chan_num, "name": chan_name})
            return channels
        except Exception as e:
            print(f"XML parse error: {e}")
            return []


WORKING_SNAPSHOT_ENDPOINTS: Dict[str, tuple] = {}

    async def get_snapshot(self, channel_id: int) -> bytes:
        """Obtiene una captura (JPEG) probando varios patrones de URL de canal con caché de endpoint exitoso."""
        cache_key = f"{self.device.host}:{channel_id}"
        
        brand_str = str(self.device.brand).lower()
        if "dahua" in brand_str:
            chan_num = channel_id
            if chan_num >= 100 and chan_num % 100 == 1:
                chan_num = chan_num // 100
            endpoints = [f"/cgi-bin/snapshot.cgi?channel={chan_num}"]
        else:
            chan_str = str(channel_id)
            candidates = []
            if chan_str.endswith("01"):
                candidates = [chan_str, str(int(chan_str[:-2]))]
            elif channel_id < 100:
                candidates = [f"{channel_id}01", str(channel_id), f"{channel_id + 100}01"]
            else:
                candidates = [chan_str]

            endpoints = []
            for c in candidates:
                endpoints.append(f"/Streaming/channels/{c}/picture")
                endpoints.append(f"/ContentMgmt/InputProxy/channels/{c}/picture")
                endpoints.append(f"/System/Video/inputs/channels/{c}/picture")

        # 1. Si ya conocemos el endpoint y puerto que funcionó antes para este canal, probarlo primero
        if cache_key in WORKING_SNAPSHOT_ENDPOINTS:
            cached_port, cached_ep = WORKING_SNAPSHOT_ENDPOINTS[cache_key]
            url = f"http://{self.device.host}:{cached_port}{cached_ep if cached_ep.startswith('/cgi-bin') else '/ISAPI' + cached_ep}"
            async with httpx.AsyncClient(timeout=1.5) as client:
                try:
                    res = await self._fetch_url(client, "GET", url)
                    if res.status_code == 200 and len(res.content) > 100:
                        return res.content
                except Exception:
                    del WORKING_SNAPSHOT_ENDPOINTS[cache_key]

        # 2. Probar candidatos con timeout rápido
        async with httpx.AsyncClient(timeout=1.2) as client:
            for port in self.http_ports:
                for ep in endpoints:
                    url = f"http://{self.device.host}:{port}{ep if ep.startswith('/cgi-bin') else '/ISAPI' + ep}"
                    try:
                        res = await self._fetch_url(client, "GET", url)
                        if res.status_code == 200 and len(res.content) > 100:
                            WORKING_SNAPSHOT_ENDPOINTS[cache_key] = (port, ep)
                            return res.content
                    except Exception:
                        pass

        raise ValueError(f"No se pudo obtener imagen para canal {channel_id} en {self.device.host}")


    def get_rtsp_url(self, channel_id: int) -> str:
        """Genera la URL RTSP para un canal específico delegando en generate_rtsp_url."""
        return generate_rtsp_url(
            host=self.device.host,
            username=self.device.username,
            password=self.device.password,
            channel_id=channel_id,
            brand=self.device.brand
        )

    async def reboot(self) -> bool:
        """Reinicia el dispositivo remotamente."""
        async with httpx.AsyncClient(timeout=5.0) as client:
            try:
                response = await self._fetch(client, "PUT", "/System/reboot")
                if response.status_code in (200, 201):
                    return True
                else:
                    raise ValueError(f"El dispositivo respondió con código de estado {response.status_code}.")
            except httpx.RequestError as e:
                raise ConnectionError(
                    f"No se pudo conectar al puerto HTTP del dispositivo: {e}. "
                    "Asegúrese de que el grabador tenga habilitada la administración HTTP local (Puerto 80)."
                )

    async def shutdown(self) -> bool:
        """Apaga el dispositivo remotamente."""
        async with httpx.AsyncClient(timeout=5.0) as client:
            try:
                response = await self._fetch(client, "PUT", "/System/shutdown")
                if response.status_code in (200, 201):
                    return True
                else:
                    raise ValueError(f"El dispositivo rechazó el comando (Código {response.status_code}).")
            except httpx.RequestError as e:
                raise ConnectionError(
                    f"No se pudo conectar al puerto HTTP del dispositivo: {e}. "
                    "Asegúrese de que el grabador tenga habilitada la administración HTTP local (Puerto 80)."
                )

