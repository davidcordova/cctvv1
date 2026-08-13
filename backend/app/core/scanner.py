import re
import socket
import struct
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
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
    'xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" '
    'xmlns:dn="http://www.onvif.org/ver10/network/wsdl">'
    '<e:Header>'
    '<w:MessageID>uuid:8437f34b-860b-4971-897c-02688b9015c7</w:MessageID>'
    '<w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>'
    '<w:Action>http://schemas.xmlsoap.org/ws/2005:04:discovery/Probe</w:Action>'
    '</e:Header>'
    '<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body>'
    '</e:Envelope>'
).encode('utf-8')


def _get_local_broadcast_addrs() -> List[str]:
    broadcasts = ["255.255.255.255"]
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127."):
                parts = ip.split(".")
                broadcasts.append(f"{parts[0]}.{parts[1]}.{parts[2]}.255")
    except Exception:
        pass
    return list(set(broadcasts))


def _check_ip_cctv(ip_mac):
    ip, mac = ip_mac
    if ip.endswith(".255") or ip.startswith("224.") or ip.startswith("239.") or ip.startswith("127."):
        return None

    mac_clean = mac.lower().replace("-", ":")
    for check_port in [80, 8000, 554, 37020, 37777]:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.25)
            res = s.connect_ex((ip, check_port))
            s.close()
            if res == 0:
                detected_brand = "Dahua" if check_port == 37777 else "Hikvision"
                return {
                    "host": ip,
                    "model": f"Grabador / Cámara CCTV ({ip})",
                    "serial": f"MAC-{mac_clean.replace(':', '')}",
                    "port": str(check_port if check_port in (80, 8000) else 80),
                    "brand": detected_brand
                }
        except Exception:
            pass
    return None


def scan_hikvision(timeout=2.0) -> List[Dict]:
    """
    Scans the local network for Hikvision/Ezviz/ONVIF CCTV devices
    using UDP Multicast/Broadcast (SADP + WS-Discovery) and ARP fallback.
    """
    devices = []
    seen_keys = set()

    # 1. UDP Multicast & Broadcast Scanning (SADP + ONVIF)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.settimeout(1.5)

    try:
        try:
            sock.sendto(SADP_MSG, (SADP_GROUP, SADP_PORT))
        except Exception:
            pass

        try:
            sock.sendto(ONVIF_MSG, (ONVIF_GROUP, ONVIF_PORT))
        except Exception:
            pass

        for b_ip in _get_local_broadcast_addrs():
            try:
                sock.sendto(SADP_MSG, (b_ip, SADP_PORT))
            except Exception:
                pass
            try:
                sock.sendto(ONVIF_MSG, (b_ip, ONVIF_PORT))
            except Exception:
                pass

        start_time = time.time()
        while time.time() - start_time < 1.5:
            try:
                data, addr = sock.recvfrom(4096)
                raw = data.decode('utf-8', errors='ignore')
                host = addr[0]

                if "<ProbeMatch>" in raw or "<DeviceDescription>" in raw or "<DeviceSN>" in raw:
                    serial = _extract_xml(raw, "DeviceSN") or _extract_xml(raw, "SerialNumber") or f"SN-{host}"
                    model = _extract_xml(raw, "DeviceDescription") or _extract_xml(raw, "DeviceModel") or "CCTV Device"
                    port = _extract_xml(raw, "HttpPort") or "80"
                    brand = "Ezviz" if "<EZVIZCode>" in raw else "Hikvision"

                    if host not in seen_keys and serial not in seen_keys:
                        seen_keys.add(host)
                        seen_keys.add(serial)
                        devices.append({
                            "host": host,
                            "model": model,
                            "serial": serial,
                            "port": port,
                            "brand": brand
                        })
                elif "onvif" in raw.lower() or "ProbeMatches" in raw:
                    if host not in seen_keys:
                        seen_keys.add(host)
                        devices.append({
                            "host": host,
                            "model": "Cámara / NVR IP (ONVIF)",
                            "serial": f"ONVIF-{host}",
                            "port": "80",
                            "brand": "Generico"
                        })
            except socket.timeout:
                break
            except Exception:
                pass
    except Exception as e:
        print(f"UDP Scan error: {e}")
    finally:
        sock.close()

    # 2. ARP Table Inspection with ThreadPoolExecutor Fallback
    try:
        arp_output = subprocess.check_output("arp -a", shell=True, text=True, errors="ignore")
        ip_matches = re.findall(r"(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fa-f\-]{17})", arp_output)

        candidates = [(ip, mac) for ip, mac in ip_matches if ip not in seen_keys]
        if candidates:
            with ThreadPoolExecutor(max_workers=30) as executor:
                results = executor.map(_check_ip_cctv, candidates)
                for res in results:
                    if res and res["host"] not in seen_keys:
                        seen_keys.add(res["host"])
                        devices.append(res)
    except Exception as e:
        print(f"ARP scan error: {e}")

    return devices


def _extract_xml(xml_content: str, tag: str) -> str:
    match = re.search(rf"<{tag}>(.*?)</{tag}>", xml_content, re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else ""

