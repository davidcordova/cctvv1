import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Plus, 
  Server, 
  Trash2, 
  RefreshCw, 
  Radar, 
  CheckCircle2, 
  Edit3, 
  Monitor, 
  Power, 
  RotateCw,
  HardDrive,
  Clock,
  Video,
  AlertTriangle,
  Check,
  Disc,
  Globe,
  Radio,
  Cpu,
  Copy,
  Tag,
  ShieldCheck,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Image as ImageIcon,
  Move,
  Info,
  Key
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { deviceService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatStorageInfo } from '../utils/storageUtils';
import { AudioTalkClient } from '../utils/audioTalkStream';

const DeviceMgmt = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isViewer = user?.role === 'viewer';
  const queryClient = useQueryClient();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [editingDevice, setEditingDevice] = useState(null);
  const [activeMonitorDevice, setActiveMonitorDevice] = useState(null);
  const [isWebRTCAvailable, setIsWebRTCAvailable] = useState(false);
  const [savingCameraIds, setSavingCameraIds] = useState(new Set());
  const [savedCameraIds, setSavedCameraIds] = useState(new Set());
  const [syncingDeviceIds, setSyncingDeviceIds] = useState(new Set());
  const [syncingStorageIds, setSyncingStorageIds] = useState(new Set());
  const [syncingHardwareIds, setSyncingHardwareIds] = useState(new Set());
  const [togglingOnvifIds, setTogglingOnvifIds] = useState(new Set());
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isSyncingAllHardware, setIsSyncingAllHardware] = useState(false);
  const [copiedSerialId, setCopiedSerialId] = useState(null);
  const [cameraRefreshKeys, setCameraRefreshKeys] = useState({});
  const [monitorRefreshKey, setMonitorRefreshKey] = useState(0);
  const [isRefreshingMonitor, setIsRefreshingMonitor] = useState(false);

  useEffect(() => {
    const checkWebRTC = async () => {
      try {
        const res = await api.get('/cameras/webrtc-status');
        if (res.data && res.data.available) {
          setIsWebRTCAvailable(true);
        }
      } catch (e) {
        setIsWebRTCAvailable(false);
      }
    };
    checkWebRTC();
  }, []);

  const refreshCameraSnapshot = (cameraId) => {
    setCameraRefreshKeys(prev => ({
      ...prev,
      [cameraId]: Date.now()
    }));
  };

  const handleRefreshMonitor = () => {
    setIsRefreshingMonitor(true);
    queryClient.invalidateQueries({ queryKey: ['cameras'] });
    queryClient.invalidateQueries({ queryKey: ['devices'] });
    const now = Date.now();
    setMonitorRefreshKey(now);
    setCameraRefreshKeys(prev => {
      const next = { ...prev };
      cameras.forEach(c => { next[c.id] = now; });
      return next;
    });
    setTimeout(() => setIsRefreshingMonitor(false), 800);
  };

  const [formData, setFormData] = useState({
    name: '', host: '', port: 80, username: 'admin', password: '', device_type: 'DVR', brand: 'Hikvision', channel_count: 8, onvif_enabled: false, verification_code: ''
  });

  const { data: devices = [], isPending: isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const response = await deviceService.getDevices();
      return response.data;
    }
  });

  const { data: cameras = [], isLoading: isLoadingCameras } = useQuery({
    queryKey: ['cameras'],
    queryFn: async () => {
      const response = await api.get('/cameras/');
      return response.data;
    }
  });

  // Modal de Cámara en Pantalla Completa (Zoom)
  const [zoomedCamera, setZoomedCamera] = useState(null);
  const [modalStreamKey, setModalStreamKey] = useState(0);
  const [modalMode, setModalMode] = useState('live');
  const [modalQuality, setModalQuality] = useState('sd');
  const [modalAudioEnabled, setModalAudioEnabled] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [videoFit, setVideoFit] = useState('contain');
  const [audioVolume, setAudioVolume] = useState(0);
  const [micHelpModal, setMicHelpModal] = useState(false);
  const [micErrorMsg, setMicErrorMsg] = useState('');
  const modalIframeRef = useRef(null);
  const audioMeterRef = useRef(null);
  const audioTalkClientRef = useRef(null);

  const startAudioMeter = (stream) => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 512;
      microphone.connect(analyser);
      analyser.connect(javascriptNode);
      javascriptNode.connect(audioContext.destination);
      javascriptNode.onaudioprocess = () => {
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        let values = 0;
        for (let i = 0; i < array.length; i++) {
          values += array[i];
        }
        const average = values / array.length;
        setAudioVolume(Math.min(100, Math.round(average * 3.5)));
      };
      audioMeterRef.current = { audioContext, javascriptNode, stream };
    } catch (e) {
      console.warn('Audio meter error:', e);
    }
  };

  const stopAudioMeter = () => {
    if (audioMeterRef.current) {
      try {
        const { audioContext, javascriptNode } = audioMeterRef.current;
        if (javascriptNode) javascriptNode.disconnect();
        if (audioContext && audioContext.state !== 'closed') audioContext.close();
      } catch (e) {}
      audioMeterRef.current = null;
    }
    setAudioVolume(0);
  };

  const handleStartTalk = async () => {
    try {
      setMicErrorMsg('');
      if (!zoomedCamera) return;

      const client = new AudioTalkClient(zoomedCamera.id, (status) => {
        if (status === 'error') {
          console.warn('Voice talk WebSocket error');
        }
      });
      const stream = await client.start();
      audioTalkClientRef.current = client;

      startAudioMeter(stream);
      setIsTalking(true);
      setModalAudioEnabled(true);
    } catch (err) {
      console.error('Error starting microphone:', err);
      let msg = 'No se pudo acceder al micrófono.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Permiso denegado. Permite el acceso al micrófono en los permisos de tu navegador.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No se detectó ningún micrófono conectado en este equipo.';
      } else {
        msg = err.message || msg;
      }
      setMicErrorMsg(msg);
      setMicHelpModal(true);
      setIsTalking(false);
    }
  };

  const handleStopTalk = () => {
    if (audioTalkClientRef.current) {
      audioTalkClientRef.current.stop();
      audioTalkClientRef.current = null;
    }
    stopAudioMeter();
    setIsTalking(false);
  };

  const isTalkCapable = useMemo(() => {
    if (!zoomedCamera) return false;
    const dev = devices.find(d => d.id === zoomedCamera.device_id) || activeMonitorDevice;
    if (!dev) return false;
    const brand = String(dev.brand || '').toLowerCase();
    const model = String(dev.model || '').toLowerCase();
    const type = String(dev.device_type || '').toLowerCase();
    return brand.includes('ezviz') || type === 'ipc' || model.includes('ipc') || model.includes('h8c') || model.includes('h6c') || model.includes('h3c');
  }, [zoomedCamera, devices, activeMonitorDevice]);

  const activeDeviceCameras = useMemo(() => {
    if (!activeMonitorDevice) return [];
    return cameras.filter(c => c.device_id === activeMonitorDevice.id && c.is_installed);
  }, [cameras, activeMonitorDevice]);

  // Atajos de teclado para navegación y cierre en vista maximizada (Zoom)
  useEffect(() => {
    if (!zoomedCamera) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleStopTalk();
        setZoomedCamera(null);
        setModalAudioEnabled(false);
      } else if (e.key === 'ArrowLeft' && activeDeviceCameras.length > 1) {
        handleStopTalk();
        const currentIdx = activeDeviceCameras.findIndex(c => c.id === zoomedCamera.id);
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : activeDeviceCameras.length - 1;
        const prevCam = activeDeviceCameras[prevIdx];
        setZoomedCamera({
          ...prevCam,
          url: `${api.defaults.baseURL}/cameras/${prevCam.id}/snapshot?t=${Date.now()}`
        });
        setModalAudioEnabled(false);
        setModalStreamKey(prev => prev + 1);
      } else if (e.key === 'ArrowRight' && activeDeviceCameras.length > 1) {
        handleStopTalk();
        const currentIdx = activeDeviceCameras.findIndex(c => c.id === zoomedCamera.id);
        const nextIdx = currentIdx < activeDeviceCameras.length - 1 ? currentIdx + 1 : 0;
        const nextCam = activeDeviceCameras[nextIdx];
        setZoomedCamera({
          ...nextCam,
          url: `${api.defaults.baseURL}/cameras/${nextCam.id}/snapshot?t=${Date.now()}`
        });
        setModalAudioEnabled(false);
        setModalStreamKey(prev => prev + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomedCamera, activeDeviceCameras]);

  // Sincronizar hora individual
  const handleSyncTime = async (device) => {
    setSyncingDeviceIds(prev => new Set([...prev, device.id]));
    try {
      const res = await api.post(`/devices/${device.id}/sync-time`);
      alert(res.data.message);
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
    } catch (err) {
      alert('Error al sincronizar fecha y hora: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSyncingDeviceIds(prev => {
        const next = new Set(prev);
        next.delete(device.id);
        return next;
      });
    }
  };

  // Sincronizar hora de todos los grabadores en lote
  const handleSyncAllTime = async () => {
    const onlineDevices = devices.filter(d => d.is_online);
    if (onlineDevices.length === 0) {
      alert('No hay grabadores en línea disponibles para sincronizar hora.');
      return;
    }
    setIsSyncingAll(true);
    try {
      let syncedCount = 0;
      for (const dev of onlineDevices) {
        try {
          await api.post(`/devices/${dev.id}/sync-time`);
          syncedCount++;
        } catch (e) {
          console.error(`Error sincronizando hora en ${dev.name}:`, e);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
      alert(`✓ Sincronización horaria completada en ${syncedCount} de ${onlineDevices.length} grabadores.`);
    } catch (err) {
      alert('Error en la sincronización horaria masiva: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Sincronizar almacenamiento de un equipo
  const handleSyncStorage = async (device) => {
    if (!device.is_online) {
      alert(`El dispositivo "${device.name}" se encuentra fuera de línea.`);
      return;
    }
    setSyncingStorageIds(prev => new Set(prev).add(device.id));
    try {
      const res = await api.post(`/devices/${device.id}/sync-storage`);
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
      queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
      alert(`✓ ${res.data.message}`);
    } catch (err) {
      alert(`Error al verificar almacenamiento de ${device.name}: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSyncingStorageIds(prev => {
        const next = new Set(prev);
        next.delete(device.id);
        return next;
      });
    }
  };

  // Habilitar o deshabilitar protocolo ONVIF en el grabador / cámara IP
  const handleToggleDeviceOnvif = async (device) => {
    if (!device.is_online) {
      alert(`El dispositivo "${device.name}" se encuentra fuera de línea.`);
      return;
    }
    const nextState = !device.onvif_enabled;
    const actionText = nextState ? 'habilitar' : 'deshabilitar';
    if (!confirm(`¿Deseas ${actionText} el protocolo ONVIF en "${device.name}"?`)) {
      return;
    }

    setTogglingOnvifIds(prev => new Set([...prev, device.id]));
    try {
      const res = await api.post(`/devices/${device.id}/toggle-onvif`, { enabled: nextState });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
      queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
      alert(`✓ ${res.data.message}`);
    } catch (err) {
      alert(`Error al cambiar protocolo ONVIF en ${device.name}: ${err.response?.data?.detail || err.message}`);
    } finally {
      setTogglingOnvifIds(prev => {
        const next = new Set(prev);
        next.delete(device.id);
        return next;
      });
    }
  };

  // Sincronizar información de hardware de un equipo (Marca, Modelo, S/N, MAC, Firmware)
  const handleSyncHardware = async (device) => {
    if (!device.is_online) {
      alert(`El dispositivo "${device.name}" se encuentra fuera de línea.`);
      return;
    }
    setSyncingHardwareIds(prev => new Set([...prev, device.id]));
    try {
      const res = await api.post(`/devices/${device.id}/sync-info`);
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
      queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
      alert(`✓ ${res.data.message}`);
    } catch (err) {
      alert(`Error al sincronizar datos de hardware en ${device.name}: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSyncingHardwareIds(prev => {
        const next = new Set(prev);
        next.delete(device.id);
        return next;
      });
    }
  };

  // Sincronizar información de hardware de todos los equipos en lote
  const handleSyncAllHardware = async () => {
    setIsSyncingAllHardware(true);
    try {
      const res = await api.post('/devices/sync-all-info');
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
      queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
      alert(`✓ ${res.data.message}`);
    } catch (err) {
      alert(`Error al sincronizar hardware en lote: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsSyncingAllHardware(false);
    }
  };

  const handleCopy = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSerialId(id);
      setTimeout(() => setCopiedSerialId(null), 2000);
    }).catch(err => {
      console.error('Error al copiar:', err);
    });
  };

  const [testStatus, setTestStatus] = useState(null);

  const handleTestConnection = async () => {
    if (!formData.host) {
      setTestStatus({ success: false, message: 'Ingrese una dirección IP / Host primero.' });
      return;
    }
    setTestStatus({ loading: true });
    try {
      const payload = {
        ...formData,
        device_id: editingDevice?.id
      };
      const res = await api.post('/devices/test-connection', payload);
      setTestStatus({
        loading: false,
        success: res.data.success,
        message: res.data.message
      });
    } catch (err) {
      setTestStatus({
        loading: false,
        success: false,
        message: err.response?.data?.detail || err.message
      });
    }
  };

  const addDeviceMutation = useMutation({
    mutationFn: (newDevice) => deviceService.createDevice(newDevice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      alert('✓ Dispositivo verificado y agregado exitosamente.');
      closeModal();
    },
    onError: (error) => {
      const detail = error.response?.data?.detail;
      let message = error.message;
      if (Array.isArray(detail)) {
        message = detail.map(d => `${d.loc.join('.')}: ${d.msg}`).join('\n');
      } else if (typeof detail === 'string') {
        message = detail;
      }
      setTestStatus({ success: false, message });
      alert('Error al añadir dispositivo:\n' + message);
    }
  });

  const editDeviceMutation = useMutation({
    mutationFn: (updatedDevice) => api.put(`/devices/${editingDevice.id}`, updatedDevice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
      alert('✓ Dispositivo actualizado correctamente.');
      closeModal();
    },
    onError: (error) => {
      const detail = error.response?.data?.detail;
      let message = error.message;
      if (Array.isArray(detail)) {
        message = detail.map(d => `${d.loc.join('.')}: ${d.msg}`).join('\n');
      } else if (typeof detail === 'string') {
        message = detail;
      }
      setTestStatus({ success: false, message });
      alert('Error al editar dispositivo:\n' + message);
    }
  });

  const handleScan = async () => {
    setIsScanning(true);
    setDiscoveredDevices([]);
    try {
      const response = await api.get('/devices/scan');
      setDiscoveredDevices(response.data);
    } catch (error) {
      alert('Error al escanear la red: ' + error.message);
    } finally {
      setIsScanning(false);
    }
  };

  const adoptDevice = (dev) => {
    setTestStatus(null);
    const isIpc = (dev.type || '').toUpperCase() === 'IPC';
    setFormData({
      name: dev.model || (isIpc ? (dev.brand ? `Cámara IP ${dev.brand}` : 'Cámara IP') : (dev.brand ? `Grabador ${dev.brand}` : 'Grabador CCTV')),
      host: dev.host,
      port: parseInt(dev.port) || 80,
      username: 'admin',
      password: '',
      device_type: dev.type || 'DVR',
      brand: dev.brand || 'Hikvision',
      channel_count: dev.channel_count !== undefined ? dev.channel_count : (isIpc ? 1 : 8),
      model: dev.model || '',
      serial_number: dev.serial || dev.serial_number || '',
      mac_address: dev.mac_address || '',
      firmware_version: dev.firmware_version || '',
      onvif_enabled: dev.onvif_enabled || false,
      verification_code: dev.verification_code || ''
    });
    setIsModalOpen(true);
  };

  const editDevice = (device) => {
    setTestStatus(null);
    setEditingDevice(device);
    setFormData({
      name: device.name,
      host: device.host,
      port: device.port,
      username: device.username,
      password: '',
      device_type: device.device_type,
      brand: device.brand,
      channel_count: device.channel_count || 8,
      model: device.model || '',
      serial_number: device.serial_number || '',
      mac_address: device.mac_address || '',
      firmware_version: device.firmware_version || '',
      onvif_enabled: device.onvif_enabled || false,
      verification_code: device.verification_code || ''
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDevice(null);
    setTestStatus(null);
    setFormData({ 
      name: '', host: '', port: 80, username: 'admin', password: '', 
      device_type: 'DVR', brand: 'Hikvision', channel_count: 8, 
      model: '', serial_number: '', mac_address: '', firmware_version: '',
      onvif_enabled: false, verification_code: '' 
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingDevice) {
      editDeviceMutation.mutate(formData);
    } else {
      addDeviceMutation.mutate(formData);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Dispositivos y Grabadores</h1>
          <p className="text-zinc-500">
            Control de conectividad, estado de discos duros (HDD), modalidad de grabación y sincronización de hora.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2.5 items-center">
          {/* Botón Refrescar Diagnóstico en Vivo */}
          <button
            onClick={async () => {
              setIsRefreshingMonitor(true);
              try {
                await api.post('/devices/refresh-all');
                queryClient.invalidateQueries({ queryKey: ['devices'] });
                queryClient.invalidateQueries({ queryKey: ['cameras'] });
                queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
              } catch (e) {
                console.error(e);
              } finally {
                setTimeout(() => setIsRefreshingMonitor(false), 800);
              }
            }}
            disabled={isRefreshingMonitor}
            className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-zinc-300 px-3.5 py-2 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer text-xs"
            title="Consultar estado de disco duro y hora en vivo de todos los grabadores"
          >
            <RefreshCw size={15} className={isRefreshingMonitor ? 'animate-spin text-blue-400' : ''} />
            <span>Refrescar Diagnóstico</span>
          </button>

          {/* Botón Sincronizar Hardware Masivo */}
          <button
            onClick={handleSyncAllHardware}
            disabled={isSyncingAllHardware}
            className="flex items-center gap-2 bg-emerald-600/10 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white text-emerald-400 px-3.5 py-2 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer text-xs"
            title="Detectar y actualizar Marca, Modelo exacto, Número de Serie, MAC y Firmware de todos los dispositivos"
          >
            <Cpu size={15} className={isSyncingAllHardware ? 'animate-spin' : ''} />
            <span>{isSyncingAllHardware ? 'Sondeando...' : 'Sincronizar Hardware'}</span>
          </button>

          {/* Botón Sincronizar Hora Masiva */}
          <button
            onClick={handleSyncAllTime}
            disabled={isSyncingAll}
            className="flex items-center gap-2 bg-blue-600/10 border border-blue-500/30 hover:bg-blue-600 hover:text-white text-blue-400 px-4 py-2 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer text-xs"
            title="Sincronizar la fecha y hora de todos los grabadores con el servidor local"
          >
            <Clock size={15} className={isSyncingAll ? 'animate-spin' : ''} />
            <span>{isSyncingAll ? 'Sincronizando...' : 'Sincronizar Hora (Todos)'}</span>
          </button>

          {isAdmin && (
            <>
              <button 
                onClick={handleScan}
                disabled={isScanning}
                className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-200 px-3.5 py-2 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer text-xs"
              >
                <Radar size={15} className={isScanning ? 'animate-spin' : ''} />
                {isScanning ? 'Escaneando Red...' : 'Escanear Red'}
              </button>
              
              <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/20 active:scale-95 cursor-pointer text-xs"
              >
                <Plus size={15} />
                Añadir Manual
              </button>
            </>
          )}
        </div>
      </header>

      {/* Discovered Devices Row (Solo Admin) */}
      {isAdmin && discoveredDevices.length > 0 && (
        <div className="space-y-3 animate-in slide-in-from-top-4 duration-500">
          <h2 className="text-sm font-bold text-zinc-400 uppercase flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            Dispositivos Detectados en la Red ({discoveredDevices.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {discoveredDevices.map((dev, idx) => (
              <div key={idx} className="card-zinc bg-zinc-900/70 border border-zinc-800/90 hover:border-zinc-700 flex justify-between items-center group transition-all">
                <div className="space-y-1 min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-zinc-200 text-sm truncate">{dev.model}</p>
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border ${
                      dev.brand === 'Dahua' 
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                        : dev.brand === 'Hikvision' 
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                        : dev.brand === 'Ezviz'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}>
                      {dev.brand}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono flex items-center gap-2">
                    <span>{dev.host}:{dev.port || 80}</span>
                    <span>&bull;</span>
                    <span>{dev.channel_count || 8} Ch</span>
                  </p>
                </div>
                <button 
                  onClick={() => adoptDevice(dev)}
                  className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white text-xs font-bold rounded-lg transition-all border border-emerald-500/30 cursor-pointer shrink-0 shadow-sm active:scale-95"
                >
                  Adoptar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Devices Table */}
      <div className="card-zinc p-0 overflow-x-auto shadow-2xl border border-zinc-800/80 rounded-2xl">
        <table className="w-full text-left min-w-[950px] divide-y divide-zinc-800">
          <thead>
            <tr className="bg-zinc-900/80 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <th className="px-5 py-3.5">Grabador / Ubicación</th>
              <th className="px-5 py-3.5">Host / Red</th>
              <th className="px-5 py-3.5">Disco Duro (HDD)</th>
              <th className="px-5 py-3.5">Sincronización Horaria</th>
              <th className="px-5 py-3.5 text-center">Protocolo ONVIF</th>
              <th className="px-5 py-3.5 text-center">Conexión</th>
              <th className="px-5 py-3.5 text-right whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {isLoading ? (
              <tr><td colSpan="7" className="px-6 py-10 text-center text-zinc-500">Cargando dispositivos...</td></tr>
            ) : devices.length === 0 ? (
              <tr><td colSpan="7" className="px-6 py-10 text-center text-zinc-500">No hay dispositivos registrados.</td></tr>
            ) : devices.map((device) => {
              const isSyncing = syncingDeviceIds.has(device.id);
              const isTogglingOnvif = togglingOnvifIds.has(device.id);
              const offsetSec = device.time_offset_seconds || 0;
              const absOffset = Math.abs(offsetSec);
              const isDrifted = absOffset > 300; // más de 5 minutos
              const isMildDrift = absOffset > 60 && absOffset <= 300; // entre 1 y 5 min
              
              const hddStatus = device.hdd_status || "Normal (Formato OK)";
              const isHddOk = device.is_online && (hddStatus.toLowerCase().includes("normal") || hddStatus.toLowerCase().includes("ok"));

              return (
                <tr 
                  key={device.id} 
                  onClick={() => setActiveMonitorDevice(device)}
                  className="hover:bg-zinc-800/30 cursor-pointer transition-colors group"
                >
                  {/* Nombre, Marca y Modelo */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-blue-400 group-hover:bg-blue-950/20 transition-all shrink-0">
                        <Server size={20} />
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-bold text-zinc-200 group-hover:text-white transition-colors flex items-center flex-wrap gap-1.5">
                          <span>{device.name}</span>
                          {device.model && (
                            <span className="bg-blue-950/80 text-blue-300 border border-blue-500/30 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md shadow-sm">
                              {device.model}
                            </span>
                          )}
                          {device.verification_code && (
                            <span 
                              className="bg-amber-950/80 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md shadow-sm flex items-center gap-1"
                              title={`Código de Verificación: ${device.verification_code}`}
                            >
                              <Key size={10} />
                              {device.verification_code}
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                          <span className={`font-semibold ${
                            device.brand === 'Dahua' ? 'text-amber-400' :
                            device.brand === 'Hikvision' ? 'text-rose-400' :
                            device.brand === 'Ezviz' ? 'text-cyan-400' : 'text-zinc-400'
                          }`}>
                            {device.brand}
                          </span>
                          <span>&bull;</span>
                          <span>{device.device_type}</span>
                          <span>&bull;</span>
                          <span>{device.channel_count || 8} Ch</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Host, MAC, S/N y Firmware */}
                  <td className="px-6 py-4 font-mono text-xs text-zinc-400">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-semibold text-zinc-300">
                        <span>{device.host}:{device.port}</span>
                        {device.mac_address && (
                          <span className="text-[10px] text-zinc-500 font-mono">
                            ({device.mac_address})
                          </span>
                        )}
                      </div>
                      
                      {/* Serial Number con Copiado Rápido */}
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-zinc-500 text-[10px]">S/N:</span>
                        <span className="text-zinc-300 font-bold max-w-[180px] truncate" title={device.serial_number || 'N/A'}>
                          {device.serial_number || 'No detectado'}
                        </span>
                        {device.serial_number && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(device.serial_number, `sn-${device.id}`);
                            }}
                            className="text-zinc-500 hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer"
                            title="Copiar número de serie"
                          >
                            {copiedSerialId === `sn-${device.id}` ? (
                              <Check size={12} className="text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Firmware Version */}
                      {device.firmware_version && (
                        <div className="text-[9.5px] text-zinc-500 font-mono flex items-center gap-1">
                          <span className="bg-zinc-800/90 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700/60">
                            FW: {device.firmware_version}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Estado de Disco Duro (HDD/MicroSD/SSD) */}
                  <td className="px-6 py-4">
                    {(() => {
                      const storage = formatStorageInfo(
                        device.hdd_capacity_total_gb, 
                        device.hdd_capacity_free_gb, 
                        device.storage_media_type, 
                        device.hdd_status, 
                        device.is_online
                      );
                      const isSyncingStorage = syncingStorageIds.has(device.id);

                      return (
                        <div className="space-y-1 max-w-[210px]">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                              !device.is_online 
                                ? 'bg-zinc-800 text-zinc-500 border-zinc-700' 
                                : storage.isOk 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}>
                              <HardDrive size={11} className={isSyncingStorage ? 'animate-spin' : ''} />
                              {storage.badge}
                            </span>
                            {device.is_online && !isViewer && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSyncStorage(device);
                                }}
                                disabled={isSyncingStorage}
                                title="Verificar almacenamiento real ahora"
                                className="text-zinc-500 hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer"
                              >
                                <RotateCw size={11} className={isSyncingStorage ? 'animate-spin text-blue-400' : ''} />
                              </button>
                            )}
                          </div>
                          {device.is_online && (
                            <>
                              <p className="text-[11px] font-semibold text-zinc-300 font-mono leading-tight">
                                {storage.primary}
                              </p>
                              <p className="text-[9.5px] text-zinc-500 font-mono leading-tight">
                                {storage.secondary}
                              </p>
                              {storage.percentUsed > 0 && !storage.isNvrManaged && (
                                <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden mt-1">
                                  <div 
                                    className={`h-full ${storage.percentFree > 10 ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                                    style={{ width: `${Math.min(100, storage.percentUsed)}%` }} 
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* Sincronización Horaria y Desfase */}
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                        !device.is_online 
                          ? 'bg-zinc-800 text-zinc-500 border-zinc-700'
                          : isDrifted 
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                          : isMildDrift
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                        <Clock size={11} />
                        {isDrifted 
                          ? `Desfase: ${offsetSec > 0 ? '+' : ''}${Math.round(offsetSec/60)} min` 
                          : isMildDrift
                          ? `Desfase: ${offsetSec > 0 ? '+' : ''}${Math.round(offsetSec/60)} min`
                          : 'Hora Sincronizada'}
                      </span>
                      {device.device_time && (
                        <p className="text-[10px] text-zinc-400 font-mono">
                          Hora DVR: {new Date(device.device_time).toLocaleTimeString('es-PE')}
                        </p>
                      )}
                    </div>
                  </td>

                  {/* Protocolo ONVIF Toggle */}
                  <td className="px-5 py-4 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isViewer) handleToggleDeviceOnvif(device);
                      }}
                      disabled={isTogglingOnvif || !device.is_online || isViewer}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                        isTogglingOnvif
                          ? 'bg-zinc-800 text-zinc-500 border-zinc-700'
                          : device.onvif_enabled
                          ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500 hover:text-black cursor-pointer active:scale-95'
                          : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700 cursor-pointer active:scale-95'
                      }`}
                      title={device.onvif_enabled ? "ONVIF Habilitado (Clic para deshabilitar)" : "ONVIF Deshabilitado (Clic para habilitar)"}
                    >
                      <Globe size={11} className={isTogglingOnvif ? 'animate-spin' : ''} />
                      <span>{isTogglingOnvif ? 'Cambiando...' : device.onvif_enabled ? 'ONVIF Activo' : 'ONVIF Inactivo'}</span>
                    </button>
                  </td>

                  {/* Estado Conexión */}
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      device.is_online ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                    }`}>
                      {device.is_online ? 'Online' : 'Offline'}
                    </span>
                  </td>

                  {/* Acciones */}
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5 items-center">
                      {/* Botón Sincronizar Hardware */}
                      <button
                        onClick={() => handleSyncHardware(device)}
                        disabled={syncingHardwareIds.has(device.id) || !device.is_online}
                        className="p-2 hover:bg-emerald-500/10 rounded-lg text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer disabled:opacity-40"
                        title="Sincronizar y actualizar Marca, Modelo, Serie, MAC y Firmware desde el hardware"
                      >
                        <Cpu size={17} className={syncingHardwareIds.has(device.id) ? 'animate-spin text-emerald-400' : ''} />
                      </button>

                      {/* Botón Toggle ONVIF Rápido */}
                      <button
                        onClick={() => handleToggleDeviceOnvif(device)}
                        disabled={isTogglingOnvif || !device.is_online || isViewer}
                        className={`p-2 rounded-lg transition-colors cursor-pointer disabled:opacity-40 ${
                          device.onvif_enabled ? 'text-cyan-400 hover:bg-cyan-500/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                        }`}
                        title={device.onvif_enabled ? "Deshabilitar protocolo ONVIF" : "Habilitar protocolo ONVIF"}
                      >
                        <Globe size={17} className={isTogglingOnvif ? 'animate-spin text-cyan-400' : ''} />
                      </button>

                      {/* Botón Sincronizar Hora */}
                      <button
                        onClick={() => handleSyncTime(device)}
                        disabled={isSyncing || !device.is_online}
                        className="p-2 hover:bg-blue-500/10 rounded-lg text-zinc-400 hover:text-blue-400 transition-colors cursor-pointer disabled:opacity-40"
                        title="Sincronizar fecha y hora con el servidor local"
                      >
                        <Clock size={17} className={isSyncing ? 'animate-spin text-blue-400' : ''} />
                      </button>

                      {/* Botón Ver Monitor */}
                      <button 
                        onClick={() => setActiveMonitorDevice(device)}
                        className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-400 transition-colors cursor-pointer"
                        title="Ver monitor de canales"
                      >
                        <Monitor size={17} />
                      </button>

                      {isAdmin && (
                        <>
                          <button 
                            onClick={() => editDevice(device)}
                            className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-400 transition-colors cursor-pointer"
                            title="Editar grabador"
                          >
                            <Edit3 size={17} />
                          </button>
                          {device.is_online && (
                            <>
                              <button 
                                onClick={() => {
                                  if(confirm('¿Reiniciar dispositivo ' + device.name + '?')) {
                                    api.post('/devices/' + device.id + '/reboot').then(res => {
                                      alert(res.data.message);
                                    }).catch(err => alert('Error: ' + (err.response?.data?.detail || err.message)));
                                  }
                                }}
                                className="p-2 hover:bg-yellow-500/10 rounded-lg text-zinc-400 hover:text-yellow-500 transition-colors cursor-pointer"
                                title="Reiniciar dispositivo"
                              >
                                <RotateCw size={17} />
                              </button>
                              <button 
                                onClick={() => {
                                  if(confirm('¿Apagar dispositivo ' + device.name + '? Algunos modelos no soportan apagado por software.')) {
                                    api.post('/devices/' + device.id + '/shutdown').then(res => {
                                      alert(res.data.message);
                                    }).catch(err => alert('Error: ' + (err.response?.data?.detail || err.message)));
                                  }
                                }}
                                className="p-2 hover:bg-rose-500/10 rounded-lg text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                                title="Apagar dispositivo"
                              >
                                <Power size={17} />
                              </button>
                            </>
                          )}
                          <button 
                            onClick={() => {
                              if(confirm('¿Eliminar dispositivo ' + device.name + '? Esto eliminará también sus cámaras.')) {
                                api.delete('/devices/' + device.id).then(() => {
                                  queryClient.invalidateQueries({ queryKey: ['devices'] });
                                  queryClient.invalidateQueries({ queryKey: ['cameras'] });
                                  queryClient.invalidateQueries({ queryKey: ['reports'] });
                                }).catch(err => alert('Error: ' + (err.response?.data?.detail || err.message)));
                              }
                            }}
                            className="p-2 hover:bg-rose-500/10 rounded-lg text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Eliminar dispositivo"
                          >
                            <Trash2 size={17} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Device Channel Monitor Modal */}
      {activeMonitorDevice && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setActiveMonitorDevice(null)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-[96vw] h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header con Detalles de Almacenamiento, Hardware y Hora */}
            <div className="p-4 md:px-6 md:py-3.5 border-b border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                  <Monitor size={20} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center flex-wrap gap-2">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      {activeMonitorDevice.name}
                      <span className={`w-2.5 h-2.5 rounded-full ${activeMonitorDevice.is_online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-rose-500'}`} />
                    </h2>
                    {activeMonitorDevice.model && (
                      <span className="bg-blue-950/80 text-blue-300 border border-blue-500/30 text-xs font-mono font-semibold px-2 py-0.5 rounded-md shadow-sm">
                        {activeMonitorDevice.model}
                      </span>
                    )}
                    {activeMonitorDevice.serial_number && (
                      <span className="bg-zinc-800/90 text-zinc-300 border border-zinc-700/60 text-[11px] font-mono px-2 py-0.5 rounded-md flex items-center gap-1.5 shadow-sm">
                        <span className="text-zinc-500">S/N:</span>
                        <span className="font-bold">{activeMonitorDevice.serial_number}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(activeMonitorDevice.serial_number, `modal-sn-${activeMonitorDevice.id}`);
                          }}
                          className="text-zinc-400 hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer"
                          title="Copiar número de serie"
                        >
                          {copiedSerialId === `modal-sn-${activeMonitorDevice.id}` ? (
                            <Check size={12} className="text-emerald-400" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-mono">
                    <span className="font-semibold text-zinc-300">{activeMonitorDevice.brand} &bull; {activeMonitorDevice.host}:{activeMonitorDevice.port}</span>
                    {activeMonitorDevice.mac_address && (
                      <>
                        <span>&bull;</span>
                        <span className="text-zinc-400">MAC: {activeMonitorDevice.mac_address}</span>
                      </>
                    )}
                    {activeMonitorDevice.firmware_version && (
                      <>
                        <span>&bull;</span>
                        <span className="text-zinc-400 bg-zinc-800/60 px-1.5 py-0.2 rounded">FW: {activeMonitorDevice.firmware_version}</span>
                      </>
                    )}
                    <span>&bull;</span>
                    {(() => {
                      const st = formatStorageInfo(
                        activeMonitorDevice.hdd_capacity_total_gb,
                        activeMonitorDevice.hdd_capacity_free_gb,
                        activeMonitorDevice.storage_media_type,
                        activeMonitorDevice.hdd_status,
                        activeMonitorDevice.is_online
                      );
                      return (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                          <HardDrive size={13} />
                          <span className="text-zinc-400">{st.badge}:</span>
                          <span className="text-zinc-200">{st.primary}</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Botones de acción del monitor */}
              <div className="flex flex-wrap gap-2 items-center self-end md:self-auto">
                <button
                  onClick={() => handleSyncHardware(activeMonitorDevice)}
                  disabled={syncingHardwareIds.has(activeMonitorDevice.id) || !activeMonitorDevice.is_online}
                  className="bg-zinc-800 hover:bg-zinc-700 text-emerald-400 hover:text-emerald-300 border border-zinc-700 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Sincronizar modelo, serie y firmware desde el hardware"
                >
                  <Cpu size={14} className={syncingHardwareIds.has(activeMonitorDevice.id) ? 'animate-spin' : ''} />
                  <span>Sincronizar Hardware</span>
                </button>

                <button
                  onClick={() => handleToggleDeviceOnvif(activeMonitorDevice)}
                  disabled={togglingOnvifIds.has(activeMonitorDevice.id) || !activeMonitorDevice.is_online || isViewer}
                  className={`border px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeMonitorDevice.onvif_enabled
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={activeMonitorDevice.onvif_enabled ? "Protocolo ONVIF Activo (Clic para deshabilitar)" : "Protocolo ONVIF Deshabilitado (Clic para habilitar)"}
                >
                  <Globe size={14} className={togglingOnvifIds.has(activeMonitorDevice.id) ? 'animate-spin' : ''} />
                  <span>{activeMonitorDevice.onvif_enabled ? 'ONVIF: Activo' : 'ONVIF: Inactivo'}</span>
                </button>

                <button
                  onClick={() => handleSyncTime(activeMonitorDevice)}
                  disabled={syncingDeviceIds.has(activeMonitorDevice.id) || !activeMonitorDevice.is_online}
                  className="bg-zinc-800 hover:bg-zinc-700 text-blue-400 hover:text-blue-300 border border-zinc-700 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Sincronizar fecha y hora con el servidor local"
                >
                  <Clock size={14} className={syncingDeviceIds.has(activeMonitorDevice.id) ? 'animate-spin' : ''} />
                  <span>Sincronizar Hora</span>
                </button>

                <button 
                  onClick={handleRefreshMonitor}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-semibold transition-all text-xs shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Reconectar y recargar todas las cámaras del monitor"
                >
                  <RefreshCw size={13} className={isRefreshingMonitor ? 'animate-spin' : ''} />
                  <span>Recargar Señal</span>
                </button>

                <button 
                  onClick={() => setActiveMonitorDevice(null)} 
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg font-semibold transition-all text-xs border border-zinc-700"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* Modal Content - Camera Grid */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-zinc-950/40">
              {isLoadingCameras ? (
                <div className="flex items-center justify-center h-full text-zinc-500 gap-2">
                  <RefreshCw className="animate-spin text-blue-500" size={24} />
                  <span>Cargando canales...</span>
                </div>
              ) : cameras.filter(c => c.device_id === activeMonitorDevice.id).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                  <p className="italic">No se encontraron canales o cámaras para este dispositivo.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {cameras.filter(c => c.device_id === activeMonitorDevice.id).map((camera) => {
                    const t = cameraRefreshKeys[camera.id] || monitorRefreshKey || 'initial';
                    const snapshotSrc = `${api.defaults.baseURL}/cameras/${camera.id}/snapshot?t=${t}`;
                    const isSaving = savingCameraIds.has(camera.id);
                    const isSaved = savedCameraIds.has(camera.id);

                    return (
                      <div key={camera.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col group/cam hover:border-zinc-700 transition-all duration-300">
                        {/* Camera Stream/Snapshot view */}
                        <div 
                          onClick={() => {
                            setZoomedCamera({
                              ...camera,
                              url: `${api.defaults.baseURL}/cameras/${camera.id}/snapshot?t=${Date.now()}`
                            });
                            setModalAudioEnabled(false);
                            setIsTalking(false);
                            setModalStreamKey(prev => prev + 1);
                          }}
                          className="aspect-video bg-black relative overflow-hidden flex items-center justify-center border-b border-zinc-800 cursor-pointer group/vid"
                          title="Clic para ver en Pantalla Completa y probar Intercomunicador / Micrófono"
                        >
                          {isWebRTCAvailable && camera.rtsp_url && camera.is_active ? (
                            <iframe 
                              key={`dev-mon-stream-${camera.id}-${t}`}
                              src={`/player.html?src=camera_${camera.id}&muted=1`} 
                              title={camera.name}
                              className="absolute inset-0 w-full h-full border-0 pointer-events-none"
                              scrolling="no"
                              allow="autoplay; fullscreen"
                            />
                          ) : (
                            <img 
                              src={snapshotSrc} 
                              alt={camera.name}
                              className="w-full h-full object-cover group-hover/vid:scale-105 transition-transform duration-300"
                              onError={(e) => { 
                                e.target.onerror = null; 
                                e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%233f3f46" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
                              }}
                            />
                          )}
                          
                          {/* Channel Badge & Recording Indicator */}
                          <div className="absolute top-2 left-2 flex items-center gap-1.5 z-20">
                            <span className="bg-black/70 backdrop-blur-md text-[10px] font-bold font-mono text-zinc-300 px-2 py-0.5 rounded-md border border-zinc-700/50 shadow">
                              CH {camera.channel}
                            </span>
                            {!camera.is_installed ? (
                              <span className="bg-zinc-900/90 border border-zinc-700 text-zinc-400 text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow">
                                PUERTO LIBRE
                              </span>
                            ) : camera.is_recording ? (
                              <span className="bg-rose-950/80 border border-rose-500/40 text-rose-300 text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                REC
                              </span>
                            ) : (
                              <span className="bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow">
                                SIN GRABACIÓN
                              </span>
                            )}
                            {camera.onvif_enabled && (
                              <span className="bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow">
                                <Globe size={9} />
                                ONVIF
                              </span>
                            )}
                          </div>

                          {/* Acciones Rápidas (Top Right) */}
                          <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                refreshCameraSnapshot(camera.id);
                              }}
                              className="p-1.5 bg-black/75 hover:bg-blue-600 text-zinc-300 hover:text-white rounded-lg backdrop-blur-md border border-zinc-700/60 transition-all hover:scale-110 active:scale-95 shadow-md opacity-70 hover:opacity-100 cursor-pointer"
                              title="Reconectar señal de esta cámara"
                            >
                              <RefreshCw size={12} className={cameraRefreshKeys[camera.id] ? 'animate-spin' : ''} />
                            </button>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setZoomedCamera({
                                  ...camera,
                                  url: `${api.defaults.baseURL}/cameras/${camera.id}/snapshot?t=${Date.now()}`
                                });
                                setModalAudioEnabled(false);
                                setIsTalking(false);
                                setModalStreamKey(prev => prev + 1);
                              }}
                              className="p-1.5 bg-black/75 hover:bg-emerald-600 text-zinc-300 hover:text-white rounded-lg backdrop-blur-md border border-zinc-700/60 transition-all hover:scale-110 active:scale-95 shadow-md flex items-center gap-1 cursor-pointer"
                              title="Ver en Pantalla Completa y probar Intercomunicador / Micrófono"
                            >
                              <Maximize2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Camera Settings Form */}
                        <div className="p-3 space-y-2.5 flex-1 flex flex-col justify-between bg-zinc-900/40">
                          <div className="flex gap-2 items-center">
                            <input 
                              type="text" 
                              defaultValue={camera.name} 
                              id={`modal-cam-name-${camera.id}`}
                              disabled={isViewer}
                              className={`flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none ${
                                isViewer ? 'text-zinc-400 cursor-not-allowed opacity-75' : 'text-zinc-200 focus:border-blue-500'
                              }`}
                              placeholder="Nombre del canal"
                            />
                            
                            {!isViewer && (
                              <button 
                                disabled={isSaving}
                                onClick={() => {
                                  const newName = document.getElementById(`modal-cam-name-${camera.id}`).value;
                                  const newInstalled = document.getElementById(`modal-cam-inst-${camera.id}`).checked;
                                  const newActive = newInstalled ? document.getElementById(`modal-cam-active-${camera.id}`).checked : false;
                                  const newRecording = newInstalled ? document.getElementById(`modal-cam-rec-${camera.id}`).checked : false;
                                  const newAudio = document.getElementById(`modal-cam-audio-${camera.id}`)?.checked ?? false;
                                  const newOnvif = document.getElementById(`modal-cam-onvif-${camera.id}`)?.checked ?? false;
                                  
                                  setSavingCameraIds(prev => new Set([...prev, camera.id]));
                                  api.put(`/cameras/${camera.id}`, { 
                                    name: newName, 
                                    is_installed: newInstalled,
                                    is_active: newActive,
                                    is_recording: newRecording,
                                    audio_enabled: newAudio,
                                    onvif_enabled: newOnvif,
                                    recording_mode: !newInstalled ? "Puerto Libre / Sin Cámara" : newRecording ? "Continuo (24/7)" : "No Grabando / Deshabilitado"
                                  }).then(() => {
                                    queryClient.invalidateQueries({ queryKey: ['cameras'] });
                                    queryClient.invalidateQueries({ queryKey: ['devices'] });
                                    queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
                                    refreshCameraSnapshot(camera.id);
                                    setSavingCameraIds(prev => {
                                      const next = new Set(prev);
                                      next.delete(camera.id);
                                      return next;
                                    });
                                    setSavedCameraIds(prev => new Set([...prev, camera.id]));
                                    setTimeout(() => {
                                      setSavedCameraIds(prev => {
                                        const next = new Set(prev);
                                        next.delete(camera.id);
                                        return next;
                                      });
                                    }, 2000);
                                  }).catch(err => {
                                    setSavingCameraIds(prev => {
                                      const next = new Set(prev);
                                      next.delete(camera.id);
                                      return next;
                                    });
                                    alert('Error: ' + err.message);
                                  });
                                }}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all min-w-[70px] text-center cursor-pointer ${
                                  isSaved ? 'bg-emerald-500/20 text-emerald-500' :
                                  isSaving ? 'bg-zinc-800 text-zinc-500' :
                                  'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/10 active:scale-95'
                                }`}
                              >
                                {isSaved ? '✓ Guardado' : isSaving ? '...' : 'Guardar'}
                              </button>
                            )}
                          </div>

                          {/* Opciones de Inventario y Modalidad */}
                          <div className="space-y-1.5 pt-1 border-t border-zinc-800/80">
                            {/* Checkbox de Puerto Instalado vs Libre */}
                            <label className={`flex items-center gap-1.5 select-none ${isViewer ? 'cursor-not-allowed opacity-75' : 'cursor-pointer text-blue-400 hover:text-blue-300 font-semibold'}`}>
                              <input 
                                type="checkbox" 
                                defaultChecked={camera.is_installed ?? true} 
                                id={`modal-cam-inst-${camera.id}`}
                                disabled={isViewer}
                                className="rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-0"
                              />
                              <span className="text-[11px]">Cámara Instalada (Puerto en Uso)</span>
                            </label>

                            {/* Toggles de Modalidad de Grabación, Muro, Audio y ONVIF */}
                            <div className="grid grid-cols-4 gap-1 text-xs pt-1 border-t border-zinc-800/40">
                              <label className={`flex items-center gap-1 select-none ${isViewer ? 'cursor-not-allowed opacity-75' : 'cursor-pointer text-zinc-400 hover:text-zinc-200'}`}>
                                <input 
                                  type="checkbox" 
                                  defaultChecked={camera.is_active} 
                                  id={`modal-cam-active-${camera.id}`}
                                  disabled={isViewer}
                                  className="rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-0"
                                />
                                <span className="text-[10px]">En Muro</span>
                              </label>

                              <label className={`flex items-center gap-1 select-none ${isViewer ? 'cursor-not-allowed opacity-75' : 'cursor-pointer text-rose-400 hover:text-rose-300 font-semibold'}`}>
                                <input 
                                  type="checkbox" 
                                  defaultChecked={camera.is_recording} 
                                  id={`modal-cam-rec-${camera.id}`}
                                  disabled={isViewer}
                                  className="rounded border-zinc-800 bg-zinc-950 text-rose-600 focus:ring-0"
                                />
                                <span className="text-[10px]">Grabar</span>
                              </label>

                              <label className={`flex items-center gap-1 select-none ${isViewer ? 'cursor-not-allowed opacity-75' : 'cursor-pointer text-amber-400 hover:text-amber-300 font-semibold'}`}>
                                <input 
                                  type="checkbox" 
                                  defaultChecked={camera.audio_enabled ?? false} 
                                  id={`modal-cam-audio-${camera.id}`}
                                  disabled={isViewer}
                                  className="rounded border-zinc-800 bg-zinc-950 text-amber-500 focus:ring-0"
                                />
                                <span className="text-[10px]">Audio</span>
                              </label>

                              <label className={`flex items-center gap-1 select-none ${isViewer ? 'cursor-not-allowed opacity-75' : 'cursor-pointer text-cyan-400 hover:text-cyan-300 font-semibold'}`}>
                                <input 
                                  type="checkbox" 
                                  defaultChecked={camera.onvif_enabled ?? false} 
                                  id={`modal-cam-onvif-${camera.id}`}
                                  disabled={isViewer}
                                  className="rounded border-zinc-800 bg-zinc-950 text-cyan-500 focus:ring-0"
                                />
                                <span className="text-[10px]">ONVIF</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Device Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-in">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <h2 className="text-xl font-bold">{editingDevice ? 'Editar Grabador / Dispositivo' : 'Nuevo Dispositivo'}</h2>
              <button onClick={closeModal} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Nombre</label>
                  <input required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Host / IP</label>
                  <input required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm font-mono" value={formData.host} onChange={(e) => setFormData({...formData, host: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Puerto</label>
                  <input type="number" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm" value={formData.port} onChange={(e) => setFormData({...formData, port: parseInt(e.target.value) || 80})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Marca</label>
                  <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm" value={formData.brand} onChange={(e) => setFormData({...formData, brand: e.target.value})}>
                    <option value="Hikvision">Hikvision</option>
                    <option value="Ezviz">Ezviz</option>
                    <option value="Dahua">Dahua</option>
                    <option value="HiLook">HiLook</option>
                    <option value="Uniview">Uniview</option>
                    <option value="Generico">Genérico / RTSP</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Tipo</label>
                  <select 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm" 
                    value={formData.device_type} 
                    onChange={(e) => {
                      const newType = e.target.value;
                      const newCount = newType === 'IPC' ? 1 : (formData.channel_count === 1 ? 8 : formData.channel_count);
                      setFormData({...formData, device_type: newType, channel_count: newCount});
                    }}
                  >
                    <option value="DVR">DVR</option>
                    <option value="NVR">NVR</option>
                    <option value="IPC">Cámara IP</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">
                    {formData.device_type === 'IPC' ? 'Canales / Lentes' : 'Canales del Grabador'}
                  </label>
                  <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm" value={formData.channel_count} onChange={(e) => setFormData({...formData, channel_count: parseInt(e.target.value)})}>
                    <option value={1}>1 Canal (Cámara Individual)</option>
                    <option value={2}>2 Canales (Doble Lente)</option>
                    <option value={4}>4 Canales</option>
                    <option value={8}>8 Canales</option>
                    <option value={16}>16 Canales</option>
                    <option value={32}>32 Canales</option>
                    <option value={64}>64 Canales</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Modelo de Dispositivo</label>
                  <input 
                    placeholder="Ej. DS-7208HQHI-F1/N" 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm font-mono" 
                    value={formData.model || ''} 
                    onChange={(e) => setFormData({...formData, model: e.target.value})} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Número de Serie</label>
                  <input 
                    placeholder="Ej. DS-7208HQHI... / SN" 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm font-mono" 
                    value={formData.serial_number || ''} 
                    onChange={(e) => setFormData({...formData, serial_number: e.target.value})} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Dirección MAC</label>
                  <input 
                    placeholder="Ej. 18:68:cb:a4:f3:78" 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm font-mono" 
                    value={formData.mac_address || ''} 
                    onChange={(e) => setFormData({...formData, mac_address: e.target.value})} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Versión de Firmware</label>
                  <input 
                    placeholder="Ej. V3.4.84" 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm font-mono" 
                    value={formData.firmware_version || ''} 
                    onChange={(e) => setFormData({...formData, firmware_version: e.target.value})} 
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">
                    {editingDevice ? 'Nueva Contraseña (Opcional)' : 'Contraseña'}
                  </label>
                  <input 
                    type="password" 
                    required={!editingDevice} 
                    placeholder={editingDevice ? 'Dejar en blanco para mantener la actual' : '••••••••'}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm" 
                    value={formData.password} 
                    onChange={(e) => setFormData({...formData, password: e.target.value})} 
                  />
                </div>

                {/* Código de Verificación Ezviz / Intercomunicador */}
                <div className="col-span-2 space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-300 uppercase flex items-center gap-1.5">
                      <Key size={13} className="text-amber-400" />
                      <span>Código de Verificación (Ezviz / Cam Clave)</span>
                    </label>
                    <span className="text-[10px] text-zinc-500 font-mono">6 caracteres (ej. RYSOCR)</span>
                  </div>
                  <input 
                    type="text" 
                    maxLength={12}
                    placeholder="Ej. RYSOCR (Código de 6 letras de la etiqueta de la cámara)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm font-mono text-amber-300 placeholder-zinc-600 uppercase tracking-widest focus:border-amber-500 focus:outline-none" 
                    value={formData.verification_code || ''} 
                    onChange={(e) => setFormData({...formData, verification_code: e.target.value.toUpperCase().trim()})} 
                  />
                  <p className="text-[10px] text-zinc-500">
                    Clave de seguridad requerida en cámaras Ezviz para habilitar el audio bidireccional y hablar por la cámara desde la web.
                  </p>
                </div>

                {/* Opción de Habilitar Protocolo ONVIF */}
                <div className="col-span-2 pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300 flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={formData.onvif_enabled ?? false} 
                      onChange={(e) => setFormData({...formData, onvif_enabled: e.target.checked})}
                      className="rounded border-zinc-800 bg-zinc-950 text-cyan-500 focus:ring-0"
                    />
                    <span className="flex items-center gap-1.5">
                      <Globe size={14} className="text-cyan-400" />
                      Habilitar Protocolo ONVIF (Integración y audio)
                    </span>
                  </label>
                  <span className="text-[10px] text-zinc-500 font-mono">Profile S / T</span>
                </div>
              </div>

              {/* Panel de prueba de conexión */}
              <div className="pt-2">
                {testStatus && (
                  <div className={`p-3 rounded-lg text-xs font-medium mb-3 flex items-start gap-2 ${
                    testStatus.loading ? 'bg-blue-950/40 text-blue-300 border border-blue-800/60' :
                    testStatus.success ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60' :
                    'bg-rose-950/40 text-rose-300 border border-rose-800/60'
                  }`}>
                    {testStatus.loading ? (
                      <>
                        <RefreshCw className="animate-spin text-blue-400 shrink-0 mt-0.5" size={14} />
                        <span>Verificando conectividad y autenticación con el dispositivo...</span>
                      </>
                    ) : testStatus.success ? (
                      <>
                        <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={14} />
                        <span>{testStatus.message}</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={14} />
                        <span>{testStatus.message}</span>
                      </>
                    )}
                  </div>
                )}

                <button 
                  type="button" 
                  onClick={handleTestConnection}
                  disabled={testStatus?.loading || !formData.host}
                  className="w-full py-2 px-4 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 border border-zinc-700/60 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={testStatus?.loading ? 'animate-spin' : ''} />
                  {testStatus?.loading ? 'Comprobando dispositivo...' : '🔍 Probar Conexión y Credenciales'}
                </button>
              </div>
              
              <div className="pt-3 flex gap-3">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-bold text-sm cursor-pointer transition-all">Cancelar</button>
                <button 
                  type="submit" 
                  disabled={addDeviceMutation.isPending || editDeviceMutation.isPending || testStatus?.loading} 
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm disabled:opacity-50 cursor-pointer shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                >
                  {(addDeviceMutation.isPending || editDeviceMutation.isPending) && <RefreshCw className="animate-spin" size={15} />}
                  {addDeviceMutation.isPending || editDeviceMutation.isPending ? 'Verificando y Guardando...' : 'Guardar Dispositivo'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Zoom Modal de Cámara en Pantalla Completa e Intercomunicador */}
      {zoomedCamera && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-200"
          onClick={() => {
            handleStopTalk();
            setZoomedCamera(null);
            setModalAudioEnabled(false);
          }}
        >
          {/* Top Bar Floating Controls */}
          <div 
            className="w-full bg-zinc-900/90 backdrop-blur-md px-4 py-2.5 flex flex-wrap items-center justify-between border-b border-zinc-800 z-50 text-white gap-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <h3 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
                  <span>{zoomedCamera.name}</span>
                  {zoomedCamera.channel && (
                    <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-mono">
                      CH {zoomedCamera.channel}
                    </span>
                  )}
                </h3>
                <p className="text-[10px] text-zinc-400 font-mono hidden sm:block">
                  {zoomedCamera.rtsp_url ? (
                    <span className="text-emerald-400">● Transmisión WebRTC en Vivo</span>
                  ) : (
                    'Modo Captura Estática'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Selector Modo En Vivo vs Foto HD */}
              {isWebRTCAvailable && zoomedCamera.rtsp_url && (
                <div className="flex bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setModalMode('live')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      modalMode === 'live'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Radio size={13} className={modalMode === 'live' ? 'animate-pulse' : ''} />
                    En Vivo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalMode('snapshot');
                      setIsTalking(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      modalMode === 'snapshot'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <ImageIcon size={13} />
                    Foto HD
                  </button>
                </div>
              )}

              {/* Reload Stream Button */}
              <button
                type="button"
                onClick={() => {
                  setModalStreamKey(prev => prev + 1);
                  setZoomedCamera(prev => prev ? {
                    ...prev,
                    url: `${api.defaults.baseURL}/cameras/${prev.id}/snapshot?t=${Date.now()}`
                  } : null);
                }}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all text-xs font-medium flex items-center gap-1.5 active:scale-95 border border-zinc-700/50 cursor-pointer"
                title="Reconectar / Refrescar transmisión"
              >
                <RefreshCw size={14} />
                <span className="hidden sm:inline">Refrescar</span>
              </button>

              {/* Botón Audio / Escuchar de la cámara */}
              <button 
                type="button"
                onClick={() => {
                  const next = !modalAudioEnabled;
                  setModalAudioEnabled(next);
                  if (modalIframeRef.current && modalIframeRef.current.contentWindow) {
                    modalIframeRef.current.contentWindow.postMessage({ type: 'set_muted', muted: !next }, '*');
                  }
                }}
                className={`p-2 rounded-lg transition-all text-xs font-medium flex items-center gap-1.5 active:scale-95 border cursor-pointer ${
                  modalAudioEnabled || isTalking
                    ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-400 font-bold shadow-lg shadow-amber-500/20' 
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border-zinc-700/50'
                }`}
                title={modalAudioEnabled || isTalking ? "Silenciar audio" : "Escuchar audio de la cámara"}
              >
                {modalAudioEnabled || isTalking ? <Volume2 size={14} className="animate-pulse" /> : <VolumeX size={14} />}
                <span className="hidden sm:inline">{modalAudioEnabled || isTalking ? 'Audio Activo' : 'Silenciado'}</span>
              </button>

              {/* Botón Intercomunicador / Hablar por Micrófono */}
              {isWebRTCAvailable && zoomedCamera.rtsp_url && modalMode === 'live' && (
                <button 
                  type="button"
                  disabled={!isTalkCapable}
                  onClick={() => {
                    if (!isTalking) {
                      handleStartTalk();
                    } else {
                      handleStopTalk();
                    }
                  }}
                  className={`p-2 rounded-lg transition-all text-xs font-bold flex items-center gap-1.5 active:scale-95 border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isTalking 
                      ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-lg shadow-red-600/40 animate-pulse' 
                      : isTalkCapable
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-red-400 hover:text-white border-zinc-700/50'
                      : 'bg-zinc-900 text-zinc-600 border-zinc-800'
                  }`}
                  title={
                    !isTalkCapable 
                      ? "Esta cámara analógica en grabador DVR no cuenta con bocina física de retorno" 
                      : isTalking 
                      ? "Detener transmisión de voz" 
                      : "Hablar por el altavoz de la cámara (Intercomunicador Bidireccional)"
                  }
                >
                  {isTalking ? <Mic size={14} className="text-white animate-bounce" /> : <Mic size={14} className={isTalkCapable ? "text-red-400" : "text-zinc-600"} />}
                  <span className="hidden sm:inline">
                    {isTalking ? '🔴 Transmitiendo Voz' : isTalkCapable ? '🎙️ Hablar por Cámara' : 'Micrófono N/D'}
                  </span>
                </button>
              )}

              {/* Botón Ajuste de Pantalla */}
              <button
                type="button"
                onClick={() => setVideoFit(prev => prev === 'contain' ? 'cover' : 'contain')}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all text-xs font-medium flex items-center gap-1.5 active:scale-95 border border-zinc-700/50 cursor-pointer"
                title={videoFit === 'contain' ? 'Llenar pantalla completa' : 'Mantener proporción 16:9'}
              >
                <Maximize2 size={14} className={videoFit === 'cover' ? 'text-blue-400' : ''} />
                <span className="hidden sm:inline">{videoFit === 'contain' ? 'Ajustar' : 'Llenar'}</span>
              </button>

              {/* Botón Pantalla Completa Nativa */}
              <button
                type="button"
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                  } else {
                    document.exitFullscreen().catch(() => {});
                  }
                }}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all text-xs font-medium flex items-center gap-1.5 active:scale-95 border border-zinc-700/50 cursor-pointer"
                title="Pantalla Completa F11"
              >
                <Move size={14} />
              </button>

              {/* Conmutador de Calidad SD vs HD */}
              {isWebRTCAvailable && zoomedCamera.rtsp_url && modalMode === 'live' && (
                <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 items-center text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setModalQuality('sd');
                      setModalStreamKey(prev => prev + 1);
                    }}
                    className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                      modalQuality === 'sd' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                    }`}
                    title="Calidad Fluida: Sub-stream ligero y bajo consumo de red"
                  >
                    SD Fluido
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalQuality('hd');
                      setModalStreamKey(prev => prev + 1);
                    }}
                    className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                      modalQuality === 'hd' ? 'bg-emerald-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                    }`}
                    title="Calidad HD: Flujo Principal en Alta Definición 1080p/4K"
                  >
                    HD Máx
                  </button>
                </div>
              )}

              <button 
                onClick={() => {
                  handleStopTalk();
                  setZoomedCamera(null);
                  setModalAudioEnabled(false);
                }}
                className="bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white px-3.5 py-1.5 rounded-lg font-medium transition-all text-xs active:scale-95 border border-zinc-700/50 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>

          {/* Video Player Container Maximizado al 100% */}
          <div className="flex-1 w-full h-[calc(100vh-3.5rem)] flex items-center justify-center p-0 md:p-2 bg-black relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Botón Cámara Anterior */}
            {activeDeviceCameras.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  handleStopTalk();
                  const currentIdx = activeDeviceCameras.findIndex(c => c.id === zoomedCamera.id);
                  const prevIdx = currentIdx > 0 ? currentIdx - 1 : activeDeviceCameras.length - 1;
                  const prevCam = activeDeviceCameras[prevIdx];
                  setZoomedCamera({
                    ...prevCam,
                    url: `${api.defaults.baseURL}/cameras/${prevCam.id}/snapshot?t=${Date.now()}`
                  });
                  setModalAudioEnabled(false);
                  setModalStreamKey(prev => prev + 1);
                }}
                className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-30 p-2.5 md:p-3 rounded-full bg-zinc-900/80 hover:bg-blue-600 text-zinc-300 hover:text-white backdrop-blur-md border border-zinc-700/50 shadow-2xl transition-all active:scale-90 cursor-pointer"
                title="Cámara Anterior (Flecha Izquierda)"
              >
                <ChevronLeft size={24} />
              </button>
            )}

            {/* Video Player Box */}
            <div className="w-full h-full max-w-full max-h-full flex items-center justify-center relative bg-black">
              {isWebRTCAvailable && zoomedCamera.rtsp_url && modalMode === 'live' ? (
                <iframe 
                  ref={modalIframeRef}
                  key={`dev-zoomed-stream-${zoomedCamera.id}-${modalQuality}-${modalStreamKey}-${videoFit}`}
                  src={`/player.html?src=${modalQuality === 'hd' ? `camera_${zoomedCamera.id}_hd` : `camera_${zoomedCamera.id}`}&muted=${modalAudioEnabled ? '0' : '1'}&fit=${videoFit}`} 
                  title={zoomedCamera.name}
                  className="w-full h-full max-h-full max-w-full border-0 z-10"
                  scrolling="no"
                  allow="autoplay; fullscreen"
                />
              ) : (
                <img 
                  src={zoomedCamera.url || `${api.defaults.baseURL}/cameras/${zoomedCamera.id}/snapshot?t=${Date.now()}`} 
                  alt={zoomedCamera.name} 
                  className={`w-full h-full max-h-full max-w-full ${videoFit === 'cover' ? 'object-cover' : 'object-contain'}`}
                />
              )}

              {/* Floating Intercom Control Bar */}
              {isWebRTCAvailable && zoomedCamera.rtsp_url && modalMode === 'live' && isTalkCapable && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 pointer-events-auto">
                  {isTalking ? (
                    <div className="bg-red-950/95 border-2 border-red-500/80 backdrop-blur-md rounded-2xl px-6 py-3 shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-3 duration-300">
                      <div className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full bg-red-500 animate-ping" />
                        <Mic size={22} className="text-red-400 animate-bounce" />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white tracking-wide uppercase">
                            MICRÓFONO ABIERTO — HABLA AHORA
                          </span>
                          <span className="bg-red-600 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">EN VIVO</span>
                        </div>
                        {/* VU Meter */}
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-32 h-2.5 bg-black/60 rounded-full overflow-hidden border border-red-500/30 p-0.5 flex items-center">
                            <div 
                              className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500" 
                              style={{ width: `${Math.max(4, audioVolume)}%` }} 
                            />
                          </div>
                          <span className="text-[10px] font-mono text-zinc-300 font-bold">
                            {audioVolume > 10 ? '🎙️ Voz Detectada' : '👂 Escuchando tu voz...'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleStopTalk}
                        className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 border border-red-300 cursor-pointer flex items-center gap-1.5"
                      >
                        <MicOff size={14} />
                        <span>Silenciar</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartTalk}
                      className="bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700/80 hover:border-red-500/60 backdrop-blur-md rounded-full px-5 py-2.5 shadow-2xl flex items-center gap-3 transition-all hover:scale-105 active:scale-95 cursor-pointer group"
                      title="Presiona para hablar por el altavoz de esta cámara"
                    >
                      <div className="w-8 h-8 rounded-full bg-red-600/20 group-hover:bg-red-600 flex items-center justify-center transition-colors text-red-400 group-hover:text-white">
                        <Mic size={16} />
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-bold group-hover:text-red-400 transition-colors">Hablar por la Cámara</span>
                        <span className="text-[10px] text-zinc-400">Intercomunicador bidireccional (Ezviz H6c / H8c / IP)</span>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Botón Cámara Siguiente */}
            {activeDeviceCameras.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  handleStopTalk();
                  const currentIdx = activeDeviceCameras.findIndex(c => c.id === zoomedCamera.id);
                  const nextIdx = currentIdx < activeDeviceCameras.length - 1 ? currentIdx + 1 : 0;
                  const nextCam = activeDeviceCameras[nextIdx];
                  setZoomedCamera({
                    ...nextCam,
                    url: `${api.defaults.baseURL}/cameras/${nextCam.id}/snapshot?t=${Date.now()}`
                  });
                  setModalAudioEnabled(false);
                  setModalStreamKey(prev => prev + 1);
                }}
                className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-30 p-2.5 md:p-3 rounded-full bg-zinc-900/80 hover:bg-blue-600 text-zinc-300 hover:text-white backdrop-blur-md border border-zinc-700/50 shadow-2xl transition-all active:scale-90 cursor-pointer"
                title="Cámara Siguiente (Flecha Derecha)"
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal de Ayuda de Micrófono */}
      {micHelpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-3 bg-red-950/80 rounded-xl border border-red-500/30">
                <MicOff size={24} />
              </div>
              <h3 className="font-bold text-lg text-white">Acceso al Micrófono</h3>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">{micErrorMsg}</p>
            <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 text-xs text-zinc-400 space-y-2">
              <p className="font-semibold text-zinc-200">💡 Para habilitarlo en tu navegador:</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>Haz clic en el ícono del candado o configuración junto a <code className="text-blue-400">localhost:8500</code>.</li>
                <li>Cambia el permiso de <strong>Micrófono</strong> a <strong>Permitir</strong>.</li>
              </ul>
            </div>
            <button
              onClick={() => setMicHelpModal(false)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default DeviceMgmt;
