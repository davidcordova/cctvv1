# 📖 Manual de Despliegue: CCTV Master en Windows Server 2012 / 2012 R2

Esta guía detalla el procedimiento paso a paso para instalar, configurar y ejecutar el sistema **CCTV Master** en un servidor con **Windows Server 2012 o 2012 R2**, garantizando arranque automático como servicio del sistema, alta disponibilidad y compatibilidad con transmisión WebRTC en vivo.

---

## 📋 Índice
1. [Prerrequisitos del Sistema](#1-prerrequisitos-del-sistema)
2. [Configuración de Red y Firewall](#2-configuración-de-red-y-firewall)
3. [Preparación del Proyecto](#3-preparación-del-proyecto)
4. [Método 1: Despliegue Nativo con Python y NSSM (Recomendado)](#4-método-1-despliegue-nativo-con-python-y-nssm-recomendado)
5. [Método 2: Integración con IIS (Reverse Proxy Puerto 80 / HTTPS 443)](#5-método-2-integración-con-iis-reverse-proxy-puerto-80--https-443)
6. [Mantenimiento y Respaldo de Base de Datos](#6-mantenimiento-y-respaldo-de-base-de-datos)
7. [Solución de Problemas Frecuentes](#7-solución-de-problemas-frecuentes)

---

## 1. Prerrequisitos del Sistema

### A. Actualizaciones de Windows Server 2012
> **IMPORTANTE:** Windows Server 2012 requiere tener instaladas las librerías de tiempo de ejecución de C++ y la actualización de compatibilidad Universal C Runtime (KB2999226).

1. Descargar e instalar **Visual C++ Redistributable 2015-2022 (x64)**:
   * [Descarga oficial de Microsoft](https://aka.ms/vs/17/release/vc_redist.x64.exe)
2. Si usas **Windows Server 2012 R2**, asegúrate de tener instalada la actualización acumulativa **KB2919355**.

### B. Software Requerido
* **Python 3.10 o 3.11 (64-bit)**:
  * Descargar el instalador de [Python 3.10.11](https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe) o [Python 3.11.9](https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe).
  * ⚠️ **Marcar la casilla:** `"Add Python to PATH"` durante la instalación.
* **NSSM (Non-Sucking Service Manager)**:
  * Herramienta para convertir scripts de Python en Servicios de Windows que inician automáticamente al encender el servidor sin requerir que un usuario inicie sesión.
  * Descarga: [nssm.cc/download](https://nssm.cc/release/nssm-2.24.zip)

---

## 2. Configuración de Red y Firewall

Abre **PowerShell como Administrador** en el servidor y ejecuta las siguientes reglas para permitir el tráfico web y la transmisión WebRTC de las cámaras:

```powershell
# 1. Permitir acceso a la Interfaz Web y API (Puerto 8500 o 80)
New-NetFirewallRule -DisplayName "CCTV Master - Web & API (8500)" -Direction Inbound -Protocol TCP -LocalPort 8500 -Action Allow

# 2. Permitir streaming WebRTC (Puertos 1984 TCP y 8555 TCP/UDP)
New-NetFirewallRule -DisplayName "CCTV Master - WebRTC API (1984)" -Direction Inbound -Protocol TCP -LocalPort 1984 -Action Allow
New-NetFirewallRule -DisplayName "CCTV Master - WebRTC Stream TCP (8555)" -Direction Inbound -Protocol TCP -LocalPort 8555 -Action Allow
New-NetFirewallRule -DisplayName "CCTV Master - WebRTC Stream UDP (8555)" -Direction Inbound -Protocol UDP -LocalPort 8555 -Action Allow
```

---

## 3. Preparación del Proyecto

1. Copia la carpeta del proyecto a una ruta fija en el servidor, por ejemplo:
   ```text
   C:\CCTV_Master
   ```
2. Asegúrate de que la estructura contenga:
   * `C:\CCTV_Master\backend\`
   * `C:\CCTV_Master\frontend\dist\` (Archivos compilados de la interfaz)
   * `C:\CCTV_Master\backend\go2rtc.exe`

---

## 4. Método 1: Despliegue Nativo con Python y NSSM (Recomendado)

### Paso 4.1: Crear el entorno virtual e instalar dependencias
Abre el Símbolo del Sistema (**CMD**) como Administrador:

```cmd
cd C:\CCTV_Master\backend
python -m venv venv
venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Paso 4.2: Inicializar la Base de Datos
Ejecuta una vez el inicializador para crear las tablas y el usuario administrador:
```cmd
venv\Scripts\python.exe init_db.py
```

### Paso 4.3: Instalar como Servicio de Windows con NSSM
1. Extrae `nssm.exe` (de la carpeta `win64`) en `C:\CCTV_Master\nssm.exe`.
2. Abre **CMD como Administrador** y ejecuta:

```cmd
C:\CCTV_Master\nssm.exe install CCTV_Master_Service
```

3. Se abrirá la ventana gráfica de configuración de NSSM. Completa los campos:
   * **Path:** `C:\CCTV_Master\backend\venv\Scripts\python.exe`
   * **Startup directory:** `C:\CCTV_Master\backend`
   * **Arguments:** `-m uvicorn app.main:app --app-dir . --host 0.0.0.0 --port 8500`
   * En la pestaña **Details**:
     * **Display name:** `CCTV Master Surveillance Server`
     * **Description:** `Servidor de Videovigilancia y Streaming WebRTC CCTV Master`
     * **Startup type:** `Automatic`
   * En la pestaña **Restart**:
     * Asegúrate de que esté configurado para reiniciar automáticamente en caso de fallo.
4. Haz clic en **Install service**.

### Paso 4.4: Iniciar el servicio
```cmd
net start CCTV_Master_Service
```

✅ **El sistema ya está funcionando 24/7 en segundo plano**, iniciando automáticamente cada vez que el servidor se encienda o reinicie.

---

## 5. Método 2: Integración con IIS (Reverse Proxy Puerto 80 / HTTPS 443)

Si deseas acceder directamente desde `http://ip-del-servidor` (Puerto 80 estándar) o `https://tudominio.com` mediante **IIS (Internet Information Services)**:

### Paso 5.1: Instalar Módulos en IIS
1. Instalar el rol **Web Server (IIS)** desde el Server Manager.
2. Instalar las siguientes extensiones oficiales de Microsoft:
   * **URL Rewrite**: [Descargar URL Rewrite x64](https://www.iis.net/downloads/microsoft/url-rewrite)
   * **Application Request Routing (ARR)**: [Descargar ARR x64](https://www.iis.net/downloads/microsoft/application-request-routing)

### Paso 5.2: Habilitar Proxy en ARR
1. Abre **IIS Manager**.
2. En el nodo raíz del servidor, haz doble clic en **Application Request Routing**.
3. En el panel derecho, haz clic en **Server Proxy Settings**.
4. Marca la casilla **Enable proxy** y haz clic en **Apply**.

### Paso 5.3: Crear el archivo `web.config`
Crea el archivo `web.config` en la raíz del sitio web de IIS (ej. `C:\inetpub\wwwroot\web.config`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReverseProxyToFastAPI" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:8500/{R:1}" />
        </rule>
      </rules>
    </rewrite>
    <httpProtocol>
      <customHeaders>
        <add name="X-Forwarded-Proto" value="http" />
      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>
```

---

## 6. Mantenimiento y Respaldo de Base de Datos

* **Ubicación de la Base de Datos SQLite:**
  ```text
  C:\CCTV_Master\backend\cctv.db
  ```
* **Script de Backup Automático (PowerShell):**
  Puedes programar una tarea en el **Programador de Tareas de Windows** para respaldar el archivo diariamente:
  ```powershell
  $Fecha = Get-Date -Format "yyyy-MM-dd"
  Copy-Item "C:\CCTV_Master\backend\cctv.db" "D:\Backups_CCTV\cctv_$Fecha.db"
  ```

---

## 7. Solución de Problemas Frecuentes

| Problema | Causa Probable | Solución |
| :--- | :--- | :--- |
| **Error `0x80070002` o `api-ms-win-crt-runtime-l1-1-0.dll`** | Falta Visual C++ Redistributable en Server 2012 | Instalar el paquete *Visual C++ Redistributable 2015-2022 x64*. |
| **No cargan las cámaras en WebRTC desde otra PC** | Bloqueo en Firewall de los puertos 1984 / 8555 | Ejecutar los comandos PowerShell del [Paso 2](#2-configuración-de-red-y-firewall). |
| **El servicio no inicia con NSSM** | Ruta de Python o directorio de trabajo incorrecto | Abrir `C:\CCTV_Master\nssm.exe edit CCTV_Master_Service` y verificar las rutas. |
| **Los grabadores aparecen fuera de línea** | El servidor no tiene visibilidad IP hacia la red de los DVRs | Comprobar con `ping 192.168.2.35` desde la consola del servidor. |

---

### 🌐 Accesos por Defecto
* **URL:** `http://<IP_DEL_SERVIDOR>:8500`
* **Usuario Inicial:** `admin`
* **Contraseña Inicial:** `admin`
