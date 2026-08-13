import httpx
import asyncio
import xml.etree.ElementTree as ET

HOST = "192.168.3.30"
PORTS = [80, 8000]
USERS = ["admin"]
PASSWORDS = ["admin1234", "IDHDRJ"]

async def test():
    print("=== TESTING HTTP ISAPI ENDPOINTS ===")
    for port in PORTS:
        for pwd in PASSWORDS:
            auth_digest = httpx.DigestAuth("admin", pwd)
            auth_basic = httpx.BasicAuth("admin", pwd)
            url = f"http://{HOST}:{port}/ISAPI/System/deviceInfo"
            print(f"\nTrying http://{HOST}:{port} with pass '{pwd}'...")
            async with httpx.AsyncClient(timeout=3.0) as client:
                try:
                    res = await client.get(url, auth=auth_digest)
                    print(f"  Digest Status: {res.status_code}")
                    if res.status_code == 200:
                        print(f"  SUCCESS Digest! Response snippet: {res.text[:200]}")
                    else:
                        res_b = await client.get(url, auth=auth_basic)
                        print(f"  Basic Status: {res_b.status_code}")
                        if res_b.status_code == 200:
                            print(f"  SUCCESS Basic! Response snippet: {res_b.text[:200]}")
                except Exception as e:
                    print(f"  Error: {e}")

    print("\n=== TESTING ISAPI CHANNEL DISCOVERY ===")
    for pwd in PASSWORDS:
        auth_digest = httpx.DigestAuth("admin", pwd)
        async with httpx.AsyncClient(timeout=3.0) as client:
            for ep in ["/ISAPI/Streaming/channels", "/ISAPI/ContentMgmt/InputProxy/channels", "/ISAPI/System/Video/inputs/channels"]:
                try:
                    res = await client.get(f"http://{HOST}:80{ep}", auth=auth_digest)
                    if res.status_code == 200:
                        print(f"Found channels on http://{HOST}:80{ep} with pass '{pwd}':")
                        print(res.text[:500])
                except Exception as e:
                    pass

if __name__ == "__main__":
    asyncio.run(test())
