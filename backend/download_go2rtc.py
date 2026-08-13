import urllib.request
import zipfile
import io
import os

def download_and_extract_go2rtc():
    url = "https://github.com/AlexxIT/go2rtc/releases/download/v1.9.4/go2rtc_win64.zip"
    print(f"Downloading go2rtc from {url}...")
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req) as response:
            zip_data = response.read()
        
        print("Extracting go2rtc.exe...")
        with zipfile.ZipFile(io.BytesIO(zip_data)) as z:
            z.extract("go2rtc.exe", ".")
            
        print("go2rtc.exe extracted successfully!")
        return True
    except Exception as e:
        print(f"Error downloading or extracting go2rtc: {e}")
        return False

if __name__ == "__main__":
    download_and_extract_go2rtc()
