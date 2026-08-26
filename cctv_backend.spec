# -*- mode: python ; coding: utf-8 -*-
import sys
import os
from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

project_dir = os.path.abspath(os.path.dirname('.'))
backend_dir = os.path.join(project_dir, 'backend')
frontend_dist = os.path.join(project_dir, 'frontend', 'dist')
go2rtc_exe = os.path.join(backend_dir, 'go2rtc.exe')
go2rtc_yaml = os.path.join(backend_dir, 'go2rtc.yaml')

datas = [
    (frontend_dist, 'static'),
]

if os.path.exists(go2rtc_exe):
    datas.append((go2rtc_exe, '.'))
if os.path.exists(go2rtc_yaml):
    datas.append((go2rtc_yaml, '.'))

hiddenimports = [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'sqlmodel',
    'sqlalchemy.ext.asyncio',
    'sqlite3',
    'pydantic_settings',
    'passlib',
    'passlib.handlers.bcrypt',
    'cryptography',
    'jose',
    'psycopg2',
    'pymysql',
    'yaml',
    'httpx',
] + collect_submodules('app')

a = Analysis(
    ['backend/app/main.py'],
    pathex=[backend_dir],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='cctv_backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='cctv_backend',
)
