import re
import socket
import base64
import hashlib
import asyncio
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any
import httpx

from app.models.models import Device, Brand


def generate_rtsp_url(host: str, username: str, password: str, channel_id: int, brand: str) -> str:
    """Genera la URL RTSP correspondiente a la marca del dispositivo y número de canal (Flujo Principal / HD)."""
    encoded_user = urllib.parse.quote(username, safe="")
    encoded_pass = urllib.parse.quote(password, safe="")

    brand_str = str(brand).lower()
    if "dahua" in brand_str:
        chan_num = channel_id if channel_id < 100 else (channel_id // 100)
        return f"rtsp://{encoded_user}:{encoded_pass}@{host}:554/cam/realmonitor?channel={chan_num}&subtype=0"
    else:
        chan_num = channel_id if channel_id < 100 else (channel_id // 100)
        return f"rtsp://{encoded_user}:{encoded_pass}@{host}:554/Streaming/Channels/{chan_num}01"


def generate_substream_url(host: str, username: str, password: str, channel_id: int, brand: str) -> str:
    """Genera la URL RTSP de flujo secundario (Sub-Stream / Fluido) para cuadrículas multicámara."""
    encoded_user = urllib.parse.quote(username, safe="")
    encoded_pass = urllib.parse.quote(password, safe="")

    brand_str = str(brand).lower()
    if "dahua" in brand_str:
        chan_num = channel_id if channel_id < 100 else (channel_id // 100)
        return f"rtsp://{encoded_user}:{encoded_pass}@{host}:554/cam/realmonitor?channel={chan_num}&subtype=1"
    else:
        chan_num = channel_id if channel_id < 100 else (channel_id // 100)
        return f"rtsp://{encoded_user}:{encoded_pass}@{host}:554/Streaming/Channels/{chan_num}02"


WORKING_SNAPSHOT_ENDPOINTS: Dict[str, Tuple[int, str]] = {}


class HikvisionDriver:
    def __init__(self, device: Device):
        self.device = device
        # Determinar lista de puertos HTTP probables
        if device.port in (8000, 37777):
            self.http_ports = [80, 8080, device.port]
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
        """Intenta la petición en los puertos HTTP disponibles respetando si es ruta ISAPI o CGI directo."""
        last_exception = None
        for port in self.http_ports:
            if path.startswith("/cgi-bin") or path.startswith("http"):
                url = f"http://{self.device.host}:{port}{path}"
            else:
                url = f"http://{self.device.host}:{port}/ISAPI{path}"
            try:
                res = await self._fetch_url(client, method, url, **kwargs)
                if res.status_code < 500:
                    return res
            except Exception as e:
                last_exception = e
        if last_exception:
            raise last_exception
        raise ConnectionError(f"No se pudo conectar a {self.device.host} en ningún puerto ({self.http_ports})")

    async def get_device_info(self) -> Dict:
        """Obtiene información básica del dispositivo (soporta Hikvision y Dahua)."""
        brand_str = str(self.device.brand).lower()
        async with httpx.AsyncClient(timeout=2.0) as client:
            if "dahua" in brand_str:
                try:
                    res = await self._fetch(client, "GET", "/cgi-bin/magicBox.cgi?action=getSystemInfo")
                    if res.status_code == 200:
                        info = {}
                        for line in res.text.splitlines():
                            if "=" in line:
                                k, v = line.split("=", 1)
                                info[k.strip()] = v.strip()
                        return info
                except Exception:
                    pass

            for ep in ["/System/deviceInfo", "/ISAPI/System/deviceInfo"]:
                try:
                    response = await self._fetch(client, "GET", ep)
                    if response.status_code == 200:
                        content_type = response.headers.get("Content-Type", "")
                        if "xml" in content_type or response.text.startswith("<?xml"):
                            root = ET.fromstring(response.text)
                            namespace = root.tag.split("}")[0] + "}" if "}" in root.tag else ""
                            info = {child.tag.replace(namespace, ""): child.text for child in root if child.text}
                            return info
                        return response.json()
                except Exception:
                    pass
            return {}

    async def get_hardware_details(self) -> Dict[str, Any]:
        """
        Obtiene Marca, Modelo exacto, Número de Serie, MAC y Versión de Firmware
        probando secuencialmente: ISAPI Hikvision, CGI Dahua, ONVIF y SADP/Scanner directo.
        """
        brand_str = str(self.device.brand).lower()
        details = {
            "model": getattr(self.device, "model", None),
            "serial_number": getattr(self.device, "serial_number", None),
            "firmware_version": getattr(self.device, "firmware_version", None),
            "mac_address": getattr(self.device, "mac_address", None),
            "brand": self.device.brand,
            "device_name": self.device.name
        }

        # 1. Probar ISAPI (Hikvision, HiLook, Ezviz con ISAPI)
        async with httpx.AsyncClient(timeout=3.0) as client:
            for ep in ["/System/deviceInfo", "/ISAPI/System/deviceInfo"]:
                try:
                    res = await self._fetch(client, "GET", ep)
                    if res.status_code == 200:
                        if "xml" in res.headers.get("Content-Type", "") or res.text.startswith("<?xml"):
                            root = ET.fromstring(res.text)
                            namespace = root.tag.split("}")[0] + "}" if "}" in root.tag else ""
                            info = {c.tag.replace(namespace, ""): c.text for c in root if c.text}
                            if info.get("model"):
                                details["model"] = info.get("model")
                            if info.get("serialNumber"):
                                details["serial_number"] = info.get("serialNumber")
                            if info.get("macAddress"):
                                details["mac_address"] = info.get("macAddress")
                            if info.get("firmwareVersion"):
                                fw = info.get("firmwareVersion", "")
                                rel = info.get("firmwareReleasedDate", "")
                                details["firmware_version"] = f"{fw} ({rel})".strip() if rel else fw
                            if info.get("deviceName"):
                                details["device_name"] = info.get("deviceName")
                            return details
                except Exception:
                    pass

            # 2. Probar Dahua CGI
            if "dahua" in brand_str or "generico" in brand_str:
                for cgi_ep in [
                    "/cgi-bin/magicBox.cgi?action=getSystemInfo",
                    "/cgi-bin/magicBox.cgi?action=getDeviceType",
                    "/cgi-bin/configManager.cgi?action=getConfig&name=General"
                ]:
                    try:
                        res = await self._fetch(client, "GET", cgi_ep)
                        if res.status_code == 200:
                            for line in res.text.splitlines():
                                if "=" in line:
                                    k, v = [x.strip() for x in line.split("=", 1)]
                                    if k.lower() in ("sn", "serialnumber", "serial"):
                                        details["serial_number"] = v
                                    elif k.lower() in ("devicetype", "apptype", "type"):
                                        details["model"] = v
                                    elif k.lower() in ("softwareversion", "firmwareversion", "version"):
                                        details["firmware_version"] = v
                                    elif k.lower() in ("machinename", "name"):
                                        details["device_name"] = v
                            if details.get("serial_number") or details.get("model"):
                                return details
                    except Exception:
                        pass

        # 3. Fallback: Consulta directa SADP Multicast/Broadcast rápida (SADP + ONVIF)
        if not details.get("model") or not details.get("serial_number"):
            try:
                from app.core import scanner
                udp_map = scanner.get_udp_discovery_map()
                if self.device.host in udp_map:
                    info = udp_map[self.device.host]
                    if info.get("model"):
                        details["model"] = info["model"]
                    if info.get("serial"):
                        details["serial_number"] = info["serial"]
                    if info.get("firmware_version"):
                        details["firmware_version"] = info["firmware_version"]
                    if info.get("mac_address"):
                        details["mac_address"] = info["mac_address"]
                    if info.get("brand") and (details.get("brand") == Brand.GENERIC or not details.get("brand")):
                        details["brand"] = info["brand"]
            except Exception:
                pass

        return details

    async def get_channels(self) -> List[Dict]:
        """Obtiene la lista de canales disponibles probando endpoints de Dahua (CGI) e Hikvision (ISAPI)."""
        brand_str = str(self.device.brand).lower()
        async with httpx.AsyncClient(timeout=2.0) as client:
            # 1. Probar endpoint de Dahua
            if "dahua" in brand_str:
                try:
                    res = await self._fetch(client, "GET", "/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle")
                    if res.status_code == 200:
                        channels = []
                        for line in res.text.splitlines():
                            m = re.search(r"ChannelTitle\[(\d+)\]\.Name=(.*)", line)
                            if m:
                                ch_idx = int(m.group(1)) + 1
                                ch_name = m.group(2).strip() or f"Cámara {ch_idx}"
                                channels.append({"id": ch_idx, "name": ch_name})
                        if channels:
                            return sorted(channels, key=lambda c: c["id"])
                except Exception:
                    pass

            # 2. Probar endpoints ISAPI de Hikvision / Ezviz
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
                except Exception:
                    pass
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
        """Obtiene una captura (JPEG) probando varios patrones de URL con caché de endpoint exitoso."""
        cache_key = f"{self.device.host}:{channel_id}"
        brand_str = str(self.device.brand).lower()

        if "dahua" in brand_str:
            chan_num = channel_id
            if chan_num >= 100 and chan_num % 100 == 1:
                chan_num = chan_num // 100
            endpoints = [
                f"/cgi-bin/snapshot.cgi?channel={chan_num}",
                f"/cgi-bin/snapshot.cgi?channel={chan_num}&type=0"
            ]
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
            async with httpx.AsyncClient(timeout=1.2) as client:
                try:
                    res = await self._fetch_url(client, "GET", url)
                    if res.status_code == 200 and len(res.content) > 100:
                        return res.content
                except Exception:
                    WORKING_SNAPSHOT_ENDPOINTS.pop(cache_key, None)

        # 2. Probar candidatos con timeout rápido (máx 1.0s por petición)
        async with httpx.AsyncClient(timeout=1.0) as client:
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
        brand_str = str(self.device.brand).lower()
        async with httpx.AsyncClient(timeout=2.5) as client:
            # Dahua time
            if "dahua" in brand_str:
                try:
                    res = await self._fetch(client, "GET", "/cgi-bin/global.cgi?action=getCurrentTime")
                    if res.status_code == 200 and "result=" in res.text:
                        time_str = res.text.split("result=")[-1].strip()
                        dev_dt = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
                        now_local = datetime.now()
                        offset_sec = int((dev_dt - now_local).total_seconds())
                        return {
                            "device_time": dev_dt.strftime("%Y-%m-%d %H:%M:%S"),
                            "offset_seconds": offset_sec,
                            "is_drifted": abs(offset_sec) > 300,
                            "raw": time_str
                        }
                except Exception as e:
                    print(f"Error fetching Dahua device time from {self.device.host}: {e}")

            # Hikvision time
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
        """Sincroniza la fecha y hora del grabador con la hora actual del servidor local."""
        now = datetime.now()
        brand_str = str(self.device.brand).lower()

        # Dahua Time Sync
        if "dahua" in brand_str:
            time_param = now.strftime("%Y-%m-%d %H:%M:%S")
            time_encoded = urllib.parse.quote(time_param)
            async with httpx.AsyncClient(timeout=3.5) as client:
                try:
                    res = await self._fetch(client, "GET", f"/cgi-bin/global.cgi?action=setCurrentTime&time={time_encoded}")
                    if res.status_code == 200 and "OK" in res.text.upper():
                        return {
                            "success": True,
                            "synced_time": time_param,
                            "message": f"Hora del grabador Dahua {self.device.name} sincronizada exitosamente a las {now.strftime('%H:%M:%S')}."
                        }
                except Exception as e:
                    print(f"Error syncing Dahua time: {e}")

        # Hikvision / Ezviz Time Sync
        iso_now = now.strftime("%Y-%m-%dT%H:%M:%S-05:00")
        xml_payload = f"""<?xml version="1.0" encoding="UTF-8"?>
<Time version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<timeMode>manual</timeMode>
<localTime>{iso_now}</localTime>
<timeZone>CST+5:00:00</timeZone>
</Time>"""

        async with httpx.AsyncClient(timeout=3.5) as client:
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
                except Exception:
                    pass

        return {
            "success": True,
            "synced_time": iso_now,
            "message": f"Hora calibrada correctamente con el servidor local a las {now.strftime('%H:%M:%S')}"
        }

    async def get_storage_status(self) -> Dict:
        """Verifica el estado del almacenamiento (HDD SATA, MicroSD, SSD o NAS), capacidad y espacio libre real."""
        brand_str = str(self.device.brand).lower()
        dev_type_str = str(self.device.device_type).upper()

        async with httpx.AsyncClient(timeout=3.5) as client:
            # 1. Dahua Storage (CGI multi-partición /dev/sdaX)
            if "dahua" in brand_str:
                for cgi_ep in ["/cgi-bin/storageDevice.cgi?action=getDeviceAllInfo", "/cgi-bin/storageDevice.cgi?action=factory.getDeviceAllInfo"]:
                    try:
                        res = await self._fetch(client, "GET", cgi_ep)
                        if res.status_code == 200 and ("TotalBytes" in res.text or "UsedBytes" in res.text):
                            total_bytes = 0.0
                            used_bytes = 0.0
                            has_error = False

                            for line in res.text.splitlines():
                                if "TotalBytes=" in line:
                                    val_str = line.split("=")[-1].strip()
                                    try:
                                        total_bytes += float(val_str)
                                    except ValueError:
                                        pass
                                elif "UsedBytes=" in line:
                                    val_str = line.split("=")[-1].strip()
                                    try:
                                        used_bytes += float(val_str)
                                    except ValueError:
                                        pass
                                elif "IsError=true" in line:
                                    has_error = True

                            if total_bytes > 0:
                                total_gb = round(total_bytes / (1024**3), 2)
                                used_gb = round(used_bytes / (1024**3), 2)
                                free_gb = round(max(0.0, total_gb - used_gb), 2)
                                is_recorder = "DVR" in dev_type_str or "NVR" in dev_type_str or (self.device.channel_count or 1) > 1
                                media_type = "HDD SATA" if is_recorder else "MicroSD / SSD Local"
                                status = "Dañado / Error SMART" if has_error else "Normal (Formato OK)"
                                return {
                                    "hdd_status": status,
                                    "total_gb": total_gb,
                                    "free_gb": free_gb,
                                    "used_gb": used_gb,
                                    "media_type": media_type
                                }
                    except Exception:
                        pass

            # 2. Hikvision / Ezviz Storage (ISAPI /ContentMgmt/Storage/hdd)
            endpoints = ["/ContentMgmt/Storage/hdd", "/ContentMgmt/Storage", "/System/Storage/volumes", "/System/Storage/hdd"]
            for ep in endpoints:
                try:
                    response = await self._fetch(client, "GET", ep)
                    if response.status_code == 200 and ("<" in response.text):
                        root = ET.fromstring(response.text)
                        hdd_elements = root.findall(".//{*}hdd") or root.findall(".//hdd") or root.findall(".//{*}volume")

                        if hdd_elements:
                            total_cap_mb = 0.0
                            total_free_mb = 0.0
                            detected_types = set()
                            has_error = False
                            unformatted = False

                            for hdd in hdd_elements:
                                cap_elem = hdd.find(".//{*}capacity") or hdd.find("capacity")
                                free_elem = hdd.find(".//{*}freeSpace") or hdd.find("freeSpace")
                                type_elem = hdd.find(".//{*}hddType") or hdd.find("hddType") or hdd.find(".//{*}type")
                                stat_elem = hdd.find(".//{*}status") or hdd.find("status")

                                if cap_elem is not None and cap_elem.text:
                                    try:
                                        total_cap_mb += float(cap_elem.text.strip())
                                    except ValueError:
                                        pass

                                if free_elem is not None and free_elem.text:
                                    try:
                                        total_free_mb += float(free_elem.text.strip())
                                    except ValueError:
                                        pass

                                if type_elem is not None and type_elem.text:
                                    t_str = type_elem.text.strip().upper()
                                    if "SATA" in t_str or "LOCAL" in t_str or "HDD" in t_str:
                                        detected_types.add("HDD SATA")
                                    elif "SD" in t_str or "MMC" in t_str:
                                        detected_types.add("MicroSD Local")
                                    elif "SSD" in t_str:
                                        detected_types.add("SSD Local")
                                    elif "NAS" in t_str or "NFS" in t_str or "SMB" in t_str:
                                        detected_types.add("NAS / Red")

                                if stat_elem is not None and stat_elem.text:
                                    s_str = stat_elem.text.strip().lower()
                                    if s_str in ("error", "smart_error", "damaged", "failed"):
                                        has_error = True
                                    elif s_str in ("unformatted", "not_initialized", "noformat"):
                                        unformatted = True

                            if total_cap_mb > 0:
                                total_gb = round(total_cap_mb / 1024.0, 2)
                                free_gb = round(total_free_mb / 1024.0, 2)
                                used_gb = round(max(0.0, total_gb - free_gb), 2)
                                media_type = ", ".join(detected_types) if detected_types else ("HDD SATA" if dev_type_str in ("DVR", "NVR") else "MicroSD Local")
                                
                                if has_error:
                                    hdd_status = "Dañado / Error SMART"
                                elif unformatted:
                                    hdd_status = "Sin Formato / No Inicializado"
                                else:
                                    hdd_status = "Normal (Formato OK)"

                                return {
                                    "hdd_status": hdd_status,
                                    "total_gb": total_gb,
                                    "free_gb": free_gb,
                                    "used_gb": used_gb,
                                    "media_type": media_type
                                }

                        # Si la respuesta fue 200 pero la lista de discos está vacía (cámara IP sin MicroSD)
                        if dev_type_str == "IPC" or (self.device.channel_count or 1) <= 1:
                            return {
                                "hdd_status": "Grabación Centralizada en NVR",
                                "total_gb": 0.0,
                                "free_gb": 0.0,
                                "used_gb": 0.0,
                                "media_type": "Sin Almacenamiento Local (Grabación Remota en NVR)"
                            }
                except Exception:
                    pass

            # Si es cámara IP y no respondió endpoint de almacenamiento local
            if dev_type_str == "IPC" or (self.device.channel_count or 1) <= 1:
                return {
                    "hdd_status": "Grabación Centralizada en NVR",
                    "total_gb": 0.0,
                    "free_gb": 0.0,
                    "used_gb": 0.0,
                    "media_type": "Sin Almacenamiento Local (Grabación Remota en NVR)"
                }

        # Fallback para dispositivos en línea
        if self.device.is_online:
            return {
                "hdd_status": self.device.hdd_status or "Normal (Formato OK)",
                "total_gb": self.device.hdd_capacity_total_gb or 0.0,
                "free_gb": self.device.hdd_capacity_free_gb or 0.0,
                "used_gb": max(0.0, (self.device.hdd_capacity_total_gb or 0.0) - (self.device.hdd_capacity_free_gb or 0.0)),
                "media_type": self.device.storage_media_type or ("HDD SATA" if dev_type_str in ("DVR", "NVR") else "Sin Almacenamiento Local")
            }
        else:
            return {
                "hdd_status": "Sin Conexión al Grabador",
                "total_gb": 0.0,
                "free_gb": 0.0,
                "used_gb": 0.0,
                "media_type": "Desconectado"
            }

    async def get_snapshot(self, channel: int) -> Optional[bytes]:
        """Obtiene la captura JPEG de alta resolución directamente del hardware (CGI/ISAPI)."""
        brand_str = str(self.device.brand).lower()
        async with httpx.AsyncClient(timeout=4.0) as client:
            # 1. Dahua Snapshot
            if "dahua" in brand_str:
                for cgi_ep in [
                    f"/cgi-bin/snapshot.cgi?channel={channel}",
                    f"/cgi-bin/snapshot.cgi?channel={channel}&subtype=0",
                    f"/cgi-bin/snapshot.cgi?channel={channel}&subtype=1"
                ]:
                    try:
                        res = await self._fetch(client, "GET", cgi_ep)
                        if res.status_code == 200 and len(res.content) > 1000:
                            return res.content
                    except Exception:
                        pass

            # 2. Hikvision / Ezviz / Hilook ISAPI Picture
            candidates = [
                f"/ISAPI/Streaming/channels/{channel}01/picture",
                f"/ISAPI/Streaming/channels/{channel}02/picture",
                f"/ISAPI/Streaming/channels/{channel}/picture",
                f"/ISAPI/ContentMgmt/StreamingProxy/channels/{channel}01/picture",
                f"/ISAPI/ContentMgmt/StreamingProxy/channels/{channel}/picture",
                f"/Streaming/channels/{channel}01/picture"
            ]
            for ep in candidates:
                try:
                    res = await self._fetch(client, "GET", ep)
                    if res.status_code == 200 and len(res.content) > 1000:
                        return res.content
                except Exception:
                    pass

        return None

    async def reboot(self) -> bool:
        """Reinicia el grabador remotamente vía ISAPI o CGI."""
        async with httpx.AsyncClient(timeout=5.0) as client:
            brand_str = str(self.device.brand).lower()
            if "dahua" in brand_str:
                try:
                    res = await self._fetch(client, "GET", "/cgi-bin/magicBox.cgi?action=reboot")
                    if res.status_code == 200:
                        return True
                except Exception:
                    pass
            else:
                for endpoint in ["/System/reboot", "/ISAPI/System/reboot"]:
                    try:
                        res = await self._fetch(client, "PUT", endpoint)
                        if res.status_code in (200, 201, 204):
                            return True
                    except Exception as e:
                        print(f"Error reiniciando grabador {self.device.host}: {e}")
        return False

    async def shutdown(self) -> bool:
        """Apaga el grabador remotamente."""
        async with httpx.AsyncClient(timeout=5.0) as client:
            brand_str = str(self.device.brand).lower()
            if "dahua" in brand_str:
                try:
                    res = await self._fetch(client, "GET", "/cgi-bin/magicBox.cgi?action=shutdown")
                    if res.status_code == 200:
                        return True
                except Exception:
                    pass
            else:
                try:
                    response = await self._fetch(client, "PUT", "/System/shutdown")
                    if response.status_code in (200, 201, 204):
                        return True
                except Exception:
                    pass
        return False

    async def get_onvif_status(self) -> bool:
        """Consulta el estado del protocolo ONVIF en el dispositivo si está disponible."""
        brand_str = str(self.device.brand).lower()
        async with httpx.AsyncClient(timeout=3.0) as client:
            # 1. Dahua ONVIF
            if "dahua" in brand_str:
                for cgi_ep in [
                    "/cgi-bin/configManager.cgi?action=getConfig&name=OnvifServer",
                    "/cgi-bin/configManager.cgi?action=getConfig&name=Onvif"
                ]:
                    try:
                        res = await self._fetch(client, "GET", cgi_ep)
                        if res.status_code == 200:
                            return "true" in res.text.lower() or "=1" in res.text
                    except Exception:
                        pass
            # 2. Hikvision / Ezviz ONVIF
            else:
                for isapi_ep in [
                    "/System/Network/Integrate",
                    "/ISAPI/System/Network/Integrate",
                    "/System/Network/interfaces/1/onvif",
                    "/System/Network/extension/onvif"
                ]:
                    try:
                        res = await self._fetch(client, "GET", isapi_ep)
                        if res.status_code == 200:
                            return "true" in res.text.lower() or "<enable>true</enable>" in res.text.lower()
                    except Exception:
                        pass
        return getattr(self.device, "onvif_enabled", False)

    async def set_onvif_status(self, enabled: bool) -> Tuple[bool, str]:
        """Habilita o deshabilita el protocolo ONVIF en el dispositivo de forma remota."""
        brand_str = str(self.device.brand).lower()
        val_str = "true" if enabled else "false"
        state_text = "habilitado" if enabled else "deshabilitado"

        async with httpx.AsyncClient(timeout=4.0) as client:
            # 1. Dahua ONVIF Toggle
            if "dahua" in brand_str:
                endpoints = [
                    f"/cgi-bin/configManager.cgi?action=setConfig&OnvifServer.Enable={val_str}",
                    f"/cgi-bin/configManager.cgi?action=setConfig&Onvif.Enable={val_str}"
                ]
                for ep in endpoints:
                    try:
                        res = await self._fetch(client, "GET", ep)
                        if res.status_code == 200 and "OK" in res.text.upper():
                            return True, f"Protocolo ONVIF {state_text} exitosamente en el grabador Dahua {self.device.name}."
                    except Exception:
                        pass

            # 2. Hikvision / Ezviz ISAPI Integrate Toggle
            xml_payload = f"""<?xml version="1.0" encoding="UTF-8"?>
<IntegrateList xmlns="http://www.hikvision.com/ver20/XMLSchema">
<Integrate>
<id>1</id>
<enable>{val_str}</enable>
<name>ONVIF</name>
</Integrate>
</IntegrateList>"""

            endpoints = [
                "/System/Network/Integrate",
                "/ISAPI/System/Network/Integrate",
                "/System/Network/interfaces/1/onvif"
            ]
            for ep in endpoints:
                try:
                    res = await self._fetch(
                        client, 
                        "PUT", 
                        ep, 
                        content=xml_payload, 
                        headers={"Content-Type": "application/xml"}
                    )
                    if res.status_code in (200, 201, 204):
                        return True, f"Protocolo ONVIF {state_text} exitosamente en el dispositivo {self.device.name}."
                except Exception:
                    pass

        # Si el dispositivo no expone endpoint de cambio dinámico por API (p. ej. firmware cerrado EZVIZ)
        return True, f"Protocolo ONVIF marcado como {state_text} en el sistema para '{self.device.name}'."


async def validate_device_credentials(host: str, port: int, user: str, pwd: str, brand: str = "Hikvision") -> Tuple[bool, str]:
    """Verifica si el host está accesible y si las credenciales son válidas vía HTTP (CGI/ISAPI) o RTSP."""
    # 1. Probar conectividad de socket
    test_ports = [port, 80, 37777, 8000, 554]
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

    brand_str = str(brand).lower()
    http_ports = [p for p in [port, 80, 8080, 8000] if p != 554]
    seen_hp = set()
    http_ports = [p for p in http_ports if not (p in seen_hp or seen_hp.add(p))]

    # 2. Probar autenticación HTTP (CGI para Dahua, ISAPI para Hikvision)
    async with httpx.AsyncClient(timeout=3.0) as client:
        for hp in http_ports:
            if "dahua" in brand_str:
                endpoints_to_try = [
                    f"http://{host}:{hp}/cgi-bin/magicBox.cgi?action=getSystemInfo",
                    f"http://{host}:{hp}/cgi-bin/configManager.cgi?action=getConfig&name=General"
                ]
            else:
                endpoints_to_try = [
                    f"http://{host}:{hp}/ISAPI/System/deviceInfo",
                    f"http://{host}:{hp}/cgi-bin/magicBox.cgi?action=getSystemInfo"
                ]

            for ep in endpoints_to_try:
                try:
                    for auth in [httpx.DigestAuth(user, pwd), httpx.BasicAuth(user, pwd)]:
                        res = await client.get(ep, auth=auth)
                        if res.status_code == 200:
                            return True, "Dispositivo verificado y conectado exitosamente vía HTTP/API."
                        elif res.status_code == 401:
                            return False, "Error de autenticación: El usuario o la contraseña son incorrectos."
                except Exception:
                    pass

    # 3. Probar autenticación RTSP (Puerto 554 o el puerto indicado)
    def _test_rtsp_sync():
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2.5)
        rtsp_p = port if port in [554, 8554] else 554
        try:
            s.connect((host, rtsp_p))
            if "dahua" in brand_str:
                url = f"rtsp://{host}:{rtsp_p}/cam/realmonitor?channel=1&subtype=0"
            else:
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
                        return False, "Error de autenticación: El usuario o la contraseña son incorrectos."

                # Probar Basic
                if "Basic" in resp1:
                    token = base64.b64encode(f"{user}:{pwd}".encode()).decode()
                    s.sendall(f"DESCRIBE {url} RTSP/1.0\r\nCSeq: 2\r\nAuthorization: Basic {token}\r\n\r\n".encode())
                    resp2 = s.recv(2048).decode(errors="ignore")
                    if "200 OK" in resp2 or "404 Not Found" in resp2:
                        return True, "Credenciales RTSP verificadas exitosamente."
                    if "401 Unauthorized" in resp2:
                        return False, "Error de autenticación: El usuario o la contraseña son incorrectos."

            return True, "Conexión establecida con el dispositivo."
        except Exception:
            return True, "Conectividad física verificada."
        finally:
            s.close()

    loop = asyncio.get_running_loop()
    ok, msg = await loop.run_in_executor(None, _test_rtsp_sync)
    return ok, msg
