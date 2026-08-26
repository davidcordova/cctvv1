import re
import socket
import struct
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict

SADP_GROUP = "239.255.255.250"
SADP_PORT = 37020

ONVIF_GROUP = "239.255.255.250"
ONVIF_PORT = 3702

SADP_MSG = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<Probe>'
    '<Uuid>36994191-4D55-4631-9759-96860E89E62C</Uuid>'
    '<Types>inquiry</Types>'
    '</Probe>'
).encode('utf-8')

ONVIF_MSG = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" '
    'xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" '
    'xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery">'
    '<e:Header>'
    '<w:MessageID>uuid:8437f34b-860b-4971-897c-02688b9015c7</w:MessageID>'
    '<w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>'
    '<w:Action>http://schemas.xmlsoap.org/ws/2005:04:discovery/Probe</w:Action>'
    '</e:Header>'
    '<e:Body><d:Probe/></e:Body>'
    '</e:Envelope>'
).encode('utf-8')


def _extract_xml(xml_content: str, tag: str) -> str:
    match = re.search(rf"<{tag}>(.*?)</{tag}>", xml_content, re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else ""


def _get_network_subnets() -> List[str]:
    subnets = set()

    # 1. Native socket resolution
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                parts = ip.split(".")
                subnets.add(f"{parts[0]}.{parts[1]}.{parts[2]}")
        
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                parts = ip.split(".")
                subnets.add(f"{parts[0]}.{parts[1]}.{parts[2]}")
    except Exception:
        pass

    # 2. Windows ipconfig resolution
    try:
        flags = 0x08000000 if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
        ipconfig_out = subprocess.check_output(
            "ipconfig",
            shell=True,
            text=True,
            errors="ignore",
            creationflags=flags
        )
        for match in re.finditer(r"IPv4[^\d]+(\d+\.\d+\.\d+\.\d+)", ipconfig_out):
            ip = match.group(1)
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                parts = ip.split(".")
                subnets.add(f"{parts[0]}.{parts[1]}.{parts[2]}")
        for match in re.finditer(r"(?:Puerta de enlace predeterminada|Default Gateway)[^\d]+(\d+\.\d+\.\d+\.\d+)", ipconfig_out):
            gw = match.group(1)
            if gw and not gw.startswith("0.") and not gw.startswith("127."):
                parts = gw.split(".")
                subnets.add(f"{parts[0]}.{parts[1]}.{parts[2]}")
    except Exception:
        pass

    # Subredes predeterminadas en caso de fallback
    if not subnets:
        subnets = {"192.168.3", "192.168.2", "192.168.1"}
    else:
        # Asegurar subredes hermanas comunes en entornos /23 o /22 de cámaras
        found_subs = list(subnets)
        for s in found_subs:
            parts = s.split(".")
            if len(parts) == 3 and parts[0] == "192" and parts[1] == "168":
                last_num = int(parts[2])
                if last_num in (2, 3):
                    subnets.add("192.168.2")
                    subnets.add("192.168.3")
                elif last_num in (0, 1):
                    subnets.add("192.168.0")
                    subnets.add("192.168.1")

    return sorted(list(subnets))


def _get_broadcast_addrs() -> List[str]:
    broadcasts = ["255.255.255.255"]
    for sub in _get_network_subnets():
        broadcasts.append(f"{sub}.255")
    return list(set(broadcasts))


def _get_arp_table() -> Dict[str, str]:
    arp_map = {}
    try:
        flags = 0x08000000 if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
        arp_output = subprocess.check_output(
            "arp -a",
            shell=True,
            text=True,
            errors="ignore",
            creationflags=flags
        )
        for ip, mac in re.findall(r"(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fa-f\-]{17})", arp_output):
            arp_map[ip] = mac.lower().replace("-", ":")
    except Exception:
        pass
    return arp_map


def _probe_cctv_ip(ip: str, arp_map: Dict[str, str]) -> Dict:
    try:
        if ip.endswith(".255") or ip.endswith(".0") or ip.startswith("127."):
            return None

        # Test distinct CCTV ports with reliable 0.35s timeout
        open_ports = []
        for p in [37777, 8000, 554, 80, 8080, 443]:
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(0.35)
                res = s.connect_ex((ip, p))
                s.close()
                if res == 0:
                    open_ports.append(p)
            except Exception:
                pass

        if not open_ports:
            return None

        mac = arp_map.get(ip, "")
        mac_clean = mac.replace(":", "") if mac else ""
        serial = f"MAC-{mac_clean}" if mac_clean else f"SN-{ip}"

        # 1. Dahua signature: port 37777 (Media SDK)
        if 37777 in open_ports:
            return {
                "host": ip,
                "model": f"Grabador DVR Dahua ({ip})",
                "serial": serial,
                "port": "80" if 80 in open_ports else ("443" if 443 in open_ports else "37777"),
                "brand": "Dahua",
                "type": "DVR",
                "channel_count": 8
            }

        # 2. Hikvision signature: port 8000 (SDK)
        if 8000 in open_ports:
            return {
                "host": ip,
                "model": f"Grabador Hikvision ({ip})",
                "serial": serial,
                "port": "80" if 80 in open_ports else ("8080" if 8080 in open_ports else "8000"),
                "brand": "Hikvision",
                "type": "DVR",
                "channel_count": 8
            }

        # 3. RTSP signature: port 554
        if 554 in open_ports:
            brand = "Generico"
            model = f"Cámara / NVR IP ({ip})"
            dev_type = "IPC"
            
            # Probe HTTP banner on 80/8080 if open to identify brand
            for hp in [80, 8080]:
                if hp in open_ports:
                    try:
                        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        s.settimeout(0.4)
                        s.connect((ip, hp))
                        s.sendall(b"GET / HTTP/1.1\r\nHost: " + ip.encode() + b"\r\n\r\n")
                        banner = s.recv(1024).decode(errors="ignore")
                        s.close()
                        if "dahua" in banner.lower() or "login to" in banner.lower() or "dh-xvr" in banner.lower():
                            brand = "Dahua"
                            model = f"Grabador DVR Dahua ({ip})"
                            dev_type = "DVR"
                            break
                        elif "hikvision" in banner.lower() or "isapi" in banner.lower() or "web-server" in banner.lower() or "dvrdvs" in banner.lower():
                            brand = "Hikvision"
                            model = f"Grabador Hikvision ({ip})"
                            dev_type = "DVR"
                            break
                    except Exception:
                        pass

            return {
                "host": ip,
                "model": model,
                "serial": serial,
                "port": "80" if 80 in open_ports else ("8080" if 8080 in open_ports else "554"),
                "brand": brand,
                "type": dev_type,
                "channel_count": 8 if dev_type == "DVR" else 1
            }

        return None
    except Exception:
        return None


def scan_network(timeout=3.0) -> List[Dict]:
    """
    Escanea la red local exhaustivamente para descubrir dispositivos CCTV (Dahua, Hikvision, Ezviz, ONVIF, etc.).
    Combina:
    1. Descubrimiento Multicast/Broadcast UDP (SADP + ONVIF WS-Discovery)
    2. Barrido activo concurrente TCP en las subredes locales (Puertos 37777, 8000, 554, 80)
    3. Resolución e inspección de tabla ARP para MAC y seriales
    """
    devices_by_ip = {}

    # 1. UDP Multicast & Broadcast Scanning (SADP + ONVIF)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.settimeout(1.0)

    try:
        for group, port in [(SADP_GROUP, SADP_PORT), (ONVIF_GROUP, ONVIF_PORT)]:
            try:
                sock.sendto(SADP_MSG if port == SADP_PORT else ONVIF_MSG, (group, port))
            except Exception:
                pass

        for b_ip in _get_broadcast_addrs():
            try:
                sock.sendto(SADP_MSG, (b_ip, SADP_PORT))
                sock.sendto(ONVIF_MSG, (b_ip, ONVIF_PORT))
            except Exception:
                pass

        start_time = time.time()
        while time.time() - start_time < 1.0:
            try:
                data, addr = sock.recvfrom(4096)
                raw = data.decode('utf-8', errors='ignore')
                host = addr[0]

                if "<ProbeMatch>" in raw or "<DeviceDescription>" in raw or "<DeviceSN>" in raw:
                    serial = _extract_xml(raw, "DeviceSN") or _extract_xml(raw, "SerialNumber") or f"SN-{host}"
                    model = _extract_xml(raw, "DeviceDescription") or _extract_xml(raw, "DeviceModel") or "CCTV Device"
                    port = _extract_xml(raw, "HttpPort") or "80"
                    brand = "Ezviz" if "<EZVIZCode>" in raw else "Hikvision"

                    devices_by_ip[host] = {
                        "host": host,
                        "model": model,
                        "serial": serial,
                        "port": port,
                        "brand": brand,
                        "type": "DVR" if "ds-7" in model.lower() or "dvr" in model.lower() or "nvr" in model.lower() else "IPC",
                        "channel_count": 8
                    }
                elif "onvif" in raw.lower() or "ProbeMatches" in raw:
                    if host not in devices_by_ip:
                        devices_by_ip[host] = {
                            "host": host,
                            "model": "Cámara / NVR IP (ONVIF)",
                            "serial": f"ONVIF-{host}",
                            "port": "80",
                            "brand": "Generico",
                            "type": "IPC",
                            "channel_count": 1
                        }
            except socket.timeout:
                break
            except Exception:
                pass
    except Exception as e:
        print(f"UDP Scan error: {e}")
    finally:
        sock.close()

    # 2. Barrido activo concurrente TCP por las subredes locales
    try:
        arp_map = _get_arp_table()
        subnets = _get_network_subnets()
        ips_to_scan = []
        for sub in subnets:
            ips_to_scan.extend([f"{sub}.{i}" for i in range(1, 255)])

        with ThreadPoolExecutor(max_workers=60) as executor:
            futures = [executor.submit(_probe_cctv_ip, ip, arp_map) for ip in ips_to_scan]
            for f in as_completed(futures):
                try:
                    res = f.result()
                    if res:
                        host = res["host"]
                        if host not in devices_by_ip:
                            devices_by_ip[host] = res
                        else:
                            # Si ya existía de UDP, actualizar marca si el puerto 37777 reveló que es Dahua
                            if res["brand"] == "Dahua":
                                devices_by_ip[host]["brand"] = "Dahua"
                                devices_by_ip[host]["model"] = res["model"]
                except Exception:
                    pass
    except Exception as e:
        print(f"Subnet probe error: {e}")

    # Convertir a lista y ordenar por IP
    def _ip_sort_key(d):
        try:
            return tuple(int(p) for p in d["host"].split("."))
        except Exception:
            return (0, 0, 0, 0)

    return sorted(list(devices_by_ip.values()), key=_ip_sort_key)


# Alias para compatibilidad hacia atrás
scan_hikvision = scan_network
