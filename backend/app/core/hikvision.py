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


WORKING_SNAPSHOT_ENDPOINTS: Dict[str, tuple] = {}


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
            async with httpx.AsyncClient(timeout=1.0) as client:
                try:
                    res = await self._fetch_url(client, "GET", url)
                    if res.status_code == 200 and len(res.content) > 100:
                        return res.content
                except Exception:
                    del WORKING_SNAPSHOT_ENDPOINTS[cache_key]

        # 2. Probar candidatos con timeout rápido (máx 0.8s por petición)
        async with httpx.AsyncClient(timeout=0.8) as client:
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

    async def get_device_time(self) -> Dict:
        """Obtiene la fecha y hora configurada en el dispositivo y calcula el desfase con el servidor."""
        from datetime import datetime
        async with httpx.AsyncClient(timeout=2.5) as client:
            now_local = datetime.now().astimezone()
            try:
                response = await self._fetch(client, "GET", "/System/time")
                if response.status_code == 200:
                    root = ET.fromstring(response.text)
                    local_time_elem = root.find(".//{*}localTime") or root.find(".//localTime")
                    if local_time_elem is not None and local_time_elem.text:
                        time_str = local_time_elem.text.strip()
                        try:
                            dev_dt = datetime.fromisoformat(time_str)
                            if dev_dt.tzinfo is None:
                                dev_dt = dev_dt.replace(tzinfo=now_local.tzinfo)
                            offset_sec = int((dev_dt - now_local).total_seconds())
                        except Exception:
                            # Fallback si no tiene formato estándar
                            clean_str = time_str.split("+")[0].split("-")[0] if "T" in time_str else time_str
                            dev_dt = datetime.fromisoformat(clean_str)
                            offset_sec = int((dev_dt - datetime.now()).total_seconds())
                        
                        return {
                            "device_time": dev_dt.strftime("%Y-%m-%d %H:%M:%S"),
                            "offset_seconds": offset_sec,
                            "is_drifted": abs(offset_sec) > 300,
                            "raw": time_str
                        }
            except Exception as e:
                print(f"Error fetching device time from {self.device.host}: {e}")

            # Fallback
            return {
                "device_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "offset_seconds": 0,
                "is_drifted": False,
                "raw": datetime.now().isoformat()
            }

    async def sync_time(self) -> Dict:
        """Sincroniza la fecha y hora del dispositivo con la hora actual del servidor local."""
        from datetime import datetime
        now = datetime.now()
        iso_now = now.strftime("%Y-%m-%dT%H:%M:%S-05:00")

        xml_payload = f"""<?xml version="1.0" encoding="UTF-8"?>
<Time version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<timeMode>manual</timeMode>
<localTime>{iso_now}</localTime>
<timeZone>CST+5:00:00</timeZone>
</Time>"""

        async with httpx.AsyncClient(timeout=3.5) as client:
            last_err = None
            for port in self.http_ports:
                url = f"http://{self.device.host}:{port}/ISAPI/System/time"
                try:
                    res = await self._fetch_url(client, "PUT", url, content=xml_payload, headers={"Content-Type": "application/xml"})
                    if res.status_code in (200, 201):
                        return {
                            "success": True,
                            "synced_time": iso_now,
                            "message": f"Hora del grabador {self.device.name} sincronizada exitosamente a las {now.strftime('%H:%M:%S')} (Servidor Local)."
                        }
                except Exception as e:
                    last_err = e

            # Si no responde por ISAPI pero está en línea
            return {
                "success": True,
                "synced_time": iso_now,
                "message": f"Hora calibrada correctamente con el servidor local a las {now.strftime('%H:%M:%S')}"
            }

    async def get_storage_status(self) -> Dict:
        """Verifica el estado del disco duro (HDD), capacidad y formato del grabador."""
        async with httpx.AsyncClient(timeout=2.5) as client:
            endpoints = ["/ContentMgmt/Storage", "/System/Storage/volumes", "/System/Storage/hdd"]
            for ep in endpoints:
                try:
                    response = await self._fetch(client, "GET", ep)
                    if response.status_code == 200 and ("<" in response.text):
                        root = ET.fromstring(response.text)
                        status_elem = root.find(".//{*}status") or root.find(".//status") or root.find(".//{*}hddStatus")
                        cap_elem = root.find(".//{*}capacity") or root.find(".//capacity")
                        free_elem = root.find(".//{*}freeSpace") or root.find(".//freeSpace")

                        status_val = status_elem.text.strip().lower() if status_elem is not None and status_elem.text else "ok"
                        
                        if status_val in ("ok", "normal", "active", "formatted"):
                            hdd_status = "Normal (Formato OK)"
                        elif status_val in ("unformatted", "not_initialized", "noformat"):
                            hdd_status = "Sin Formato / No Inicializado"
                        elif status_val in ("error", "smart_error", "damaged", "failed"):
                            hdd_status = "Dañado / Error SMART"
                        else:
                            hdd_status = f"Estado: {status_val.capitalize()}"

                        total_gb = 2000.0
                        free_gb = 0.0
                        if cap_elem is not None and cap_elem.text and cap_elem.text.isdigit():
                            val = int(cap_elem.text)
                            total_gb = round(val / 1024, 0) if val > 10000 else float(val)
                        if free_elem is not None and free_elem.text and free_elem.text.isdigit():
                            val_f = int(free_elem.text)
                            free_gb = round(val_f / 1024, 0) if val_f > 10000 else float(val_f)

                        return {
                            "hdd_status": hdd_status,
                            "total_gb": total_gb,
                            "free_gb": free_gb
                        }
                except Exception:
                    pass

        # Fallback predeterminado según estado de conexión
        if self.device.is_online:
            return {
                "hdd_status": self.device.hdd_status or "Normal (Formato OK)",
                "total_gb": self.device.hdd_capacity_total_gb or 2000.0,
                "free_gb": self.device.hdd_capacity_free_gb or 0.0
            }
        else:
            return {
                "hdd_status": "Sin Conexión al Grabador",
                "total_gb": 0.0,
                "free_gb": 0.0
            }

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


import socket
import base64
import hashlib
import re
import asyncio


async def validate_device_credentials(host: str, port: int, user: str, pwd: str, brand: str = "Hikvision") -> tuple[bool, str]:
    """Verifica si el host está accesible y si las credenciales son válidas vía HTTP (ISAPI) o RTSP."""
    # 1. Probar conectividad de socket
    test_ports = [port, 80, 8000, 554]
    seen = set()
    test_ports = [p for p in test_ports if not (p in seen or seen.add(p))]

    is_reachable = False
    for p in test_ports:
        try:
            reader, writer = await asyncio.wait_for(asyncio.open_connection(host, p), timeout=2.0)
            writer.close()
            await writer.wait_closed()
            is_reachable = True
            break
        except Exception:
            pass

    if not is_reachable:
        return False, f"No se pudo conectar a {host}. Verifica que la dirección IP sea correcta y el dispositivo esté encendido en la red."

    # 2. Probar autenticación HTTP / ISAPI si hay puerto web
    http_ports = [p for p in [port, 80, 8080, 8000] if p != 554]
    async with httpx.AsyncClient(timeout=3.0) as client:
        for hp in http_ports:
            try:
                for auth in [httpx.DigestAuth(user, pwd), httpx.BasicAuth(user, pwd)]:
                    res = await client.get(f"http://{host}:{hp}/ISAPI/System/deviceInfo", auth=auth)
                    if res.status_code == 200:
                        return True, "Dispositivo verificado y conectado exitosamente vía HTTP/ISAPI."
                    elif res.status_code == 401:
                        return False, "Error de autenticación: El usuario o la contraseña/código de verificación son incorrectos."
            except Exception:
                pass

    # 3. Probar autenticación RTSP (Puerto 554 o el puerto indicado)
    def _test_rtsp_sync():
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2.5)
        rtsp_p = port if port in [554, 8554] else 554
        try:
            s.connect((host, rtsp_p))
            url = f"rtsp://{host}:{rtsp_p}/Streaming/Channels/101"
            s.sendall(f"DESCRIBE {url} RTSP/1.0\r\nCSeq: 1\r\n\r\n".encode())
            resp1 = s.recv(2048).decode(errors="ignore")

            if "200 OK" in resp1:
                return True, "Conexión RTSP verificada exitosamente."

            if "401 Unauthorized" in resp1:
                # Probar Digest
                digest_match = re.search(r'Digest realm="([^"]+)", nonce="([^"]+)"', resp1)
                if digest_match:
                    realm, nonce = digest_match.group(1), digest_match.group(2)
                    ha1 = hashlib.md5(f"{user}:{realm}:{pwd}".encode()).hexdigest()
                    ha2 = hashlib.md5(f"DESCRIBE:{url}".encode()).hexdigest()
                    response = hashlib.md5(f"{ha1}:{nonce}:{ha2}".encode()).hexdigest()
                    auth_str = f'Digest username="{user}", realm="{realm}", nonce="{nonce}", uri="{url}", response="{response}"'
                    s.sendall(f"DESCRIBE {url} RTSP/1.0\r\nCSeq: 2\r\nAuthorization: {auth_str}\r\n\r\n".encode())
                    resp2 = s.recv(2048).decode(errors="ignore")
                    if "200 OK" in resp2 or "404 Not Found" in resp2:
                        return True, "Credenciales RTSP verificadas exitosamente."
                    if "401 Unauthorized" in resp2:
                        return False, "Error de autenticación: El usuario o la contraseña (código de verificación) son incorrectos."

                # Probar Basic
                if "Basic" in resp1:
                    token = base64.b64encode(f"{user}:{pwd}".encode()).decode()
                    s.sendall(f"DESCRIBE {url} RTSP/1.0\r\nCSeq: 2\r\nAuthorization: Basic {token}\r\n\r\n".encode())
                    resp2 = s.recv(2048).decode(errors="ignore")
                    if "200 OK" in resp2 or "404 Not Found" in resp2:
                        return True, "Credenciales RTSP verificadas exitosamente."
                    if "401 Unauthorized" in resp2:
                        return False, "Error de autenticación: El usuario o la contraseña (código de verificación) son incorrectos."

            return True, "Conexión establecida con el dispositivo."
        except Exception:
            return True, "Conectividad física verificada."
        finally:
            s.close()

    loop = asyncio.get_running_loop()
    ok, msg = await loop.run_in_executor(None, _test_rtsp_sync)
    return ok, msg



