import React, { useState, useEffect } from 'react';
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
  Disc
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { deviceService } from '../services/api';
import { useAuth } from '../context/AuthContext';

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
  const [isSyncingAll, setIsSyncingAll] = useState(false);
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
    name: '', host: '', port: 80, username: 'admin', password: '', device_type: 'DVR', brand: 'Hikvision', channel_count: 8
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

  // Sincronizar hora de todos los equipos
  const handleSyncAllTime = async () => {
    if (!confirm('¿Deseas sincronizar la fecha y hora de todos los grabadores conectados con el servidor local?')) return;
    setIsSyncingAll(true);
    try {
      const res = await api.post('/devices/sync-all-time');
      alert(res.data.message);
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
    } catch (err) {
      alert('Error en sincronización masiva: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsSyncingAll(false);
    }
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
    setFormData({
      name: dev.model || 'Grabador CCTV',
      host: dev.host,
      port: dev.port || 80,
      username: 'admin',
      password: '',
      device_type: dev.type || 'DVR',
      brand: 'Hikvision',
      channel_count: 8
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
      channel_count: device.channel_count || 8
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDevice(null);
    setTestStatus(null);
    setFormData({ name: '', host: '', port: 80, username: 'admin', password: '', device_type: 'DVR', brand: 'Hikvision', channel_count: 8 });
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
                {isScanning ? 'Escaneando...' : 'Escanear Red'}
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
          <h2 className="text-sm font-bold text-zinc-500 uppercase flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            Dispositivos Encontrados en la Red ({discoveredDevices.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {discoveredDevices.map((dev, idx) => (
              <div key={idx} className="card-zinc bg-zinc-900/50 flex justify-between items-center group">
                <div>
                  <p className="font-bold text-zinc-200">{dev.model}</p>
                  <p className="text-xs text-zinc-500 font-mono">{dev.host}</p>
                </div>
                <button 
                  onClick={() => adoptDevice(dev)}
                  className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white text-xs font-bold rounded-lg transition-all border border-emerald-500/20 cursor-pointer"
                >
                  Adoptar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Devices Table */}
      <div className="card-zinc p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-zinc-900/50 border-b border-zinc-800 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <th className="px-6 py-4">Grabador / Ubicación</th>
              <th className="px-6 py-4">Host / Red</th>
              <th className="px-6 py-4">Disco Duro (HDD)</th>
              <th className="px-6 py-4">Sincronización Horaria</th>
              <th className="px-6 py-4">Conexión</th>
              <th className="px-6 py-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {isLoading ? (
              <tr><td colSpan="6" className="px-6 py-10 text-center text-zinc-500">Cargando dispositivos...</td></tr>
            ) : devices.length === 0 ? (
              <tr><td colSpan="6" className="px-6 py-10 text-center text-zinc-500">No hay dispositivos registrados.</td></tr>
            ) : devices.map((device) => {
              const isSyncing = syncingDeviceIds.has(device.id);
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
                  {/* Nombre y Marca */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-blue-400 group-hover:bg-blue-950/20 transition-all">
                        <Server size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-zinc-200 group-hover:text-white transition-colors">{device.name}</p>
                        <p className="text-xs text-zinc-500 font-mono">{device.brand} &bull; {device.device_type} &bull; {device.channel_count || 8} Ch</p>
                      </div>
                    </div>
                  </td>

                  {/* Host e IP */}
                  <td className="px-6 py-4 font-mono text-xs text-zinc-400">
                    <div>{device.host}:{device.port}</div>
                    <div className="text-[10px] text-zinc-500">S/N: {device.serial_number || 'N/A'}</div>
                  </td>

                  {/* Estado de Disco Duro (HDD) */}
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                        !device.is_online 
                          ? 'bg-zinc-800 text-zinc-500 border-zinc-700' 
                          : isHddOk 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        <HardDrive size={11} />
                        {device.is_online ? hddStatus : 'Offline'}
                      </span>
                      {device.is_online && (
                        <p className="text-[10px] text-zinc-500 font-mono">
                          Capacidad: {device.hdd_capacity_total_gb || 2000} GB
                        </p>
                      )}
                    </div>
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

                  {/* Estado Conexión */}
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      device.is_online ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                    }`}>
                      {device.is_online ? 'Online' : 'Offline'}
                    </span>
                  </td>

                  {/* Acciones */}
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5 items-center">
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
            {/* Modal Header con Detalles de Almacenamiento y Hora */}
            <div className="p-4 md:px-6 md:py-3.5 border-b border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400">
                  <Monitor size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    {activeMonitorDevice.name}
                    <span className={`w-2.5 h-2.5 rounded-full ${activeMonitorDevice.is_online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-rose-500'}`} />
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-mono mt-0.5">
                    <span>{activeMonitorDevice.brand} &bull; {activeMonitorDevice.host}:{activeMonitorDevice.port}</span>
                    <span>&bull;</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <HardDrive size={13} />
                      HDD: {activeMonitorDevice.hdd_status || 'Normal (Formato OK)'} ({activeMonitorDevice.hdd_capacity_free_gb || 420} GB Libres)
                    </span>
                  </div>
                </div>
              </div>

              {/* Botones de acción del monitor */}
              <div className="flex flex-wrap gap-2 items-center self-end md:self-auto">
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
                        <div className="aspect-video bg-black relative overflow-hidden flex items-center justify-center border-b border-zinc-800">
                          {isWebRTCAvailable && camera.rtsp_url && camera.is_active ? (
                            <iframe 
                              key={`dev-mon-stream-${camera.id}-${t}`}
                              src={`http://${window.location.hostname}:1984/webrtc.html?src=camera_${camera.id}&mode=webrtc,mse,mp4,mjpeg`} 
                              title={camera.name}
                              className="absolute inset-0 w-full h-full border-0 pointer-events-none"
                              scrolling="no"
                              allow="autoplay; fullscreen"
                            />
                          ) : (
                            <img 
                              src={snapshotSrc} 
                              alt={camera.name}
                              className="w-full h-full object-cover"
                              onError={(e) => { 
                                e.target.onerror = null; 
                                e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%233f3f46" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
                              }}
                            />
                          )}
                          
                          {/* Channel Badge & Recording Indicator */}
                          <div className="absolute top-2 left-2 flex items-center gap-1.5">
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
                          </div>

                          {/* Manual Single Camera Refresh Button (Top Right) */}
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              refreshCameraSnapshot(camera.id);
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-black/75 hover:bg-blue-600 text-zinc-300 hover:text-white rounded-lg backdrop-blur-md border border-zinc-700/60 transition-all z-20 hover:scale-110 active:scale-95 shadow-md opacity-70 hover:opacity-100"
                            title="Reconectar señal de esta cámara"
                          >
                            <RefreshCw size={12} className={cameraRefreshKeys[camera.id] ? 'animate-spin' : ''} />
                          </button>
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
                                  
                                  setSavingCameraIds(prev => new Set([...prev, camera.id]));
                                  api.put(`/cameras/${camera.id}`, { 
                                    name: newName, 
                                    is_installed: newInstalled,
                                    is_active: newActive,
                                    is_recording: newRecording,
                                    audio_enabled: newAudio,
                                    recording_mode: !newInstalled ? "Puerto Libre / Sin Cámara" : newRecording ? "Continuo (24/7)" : "No Grabando / Deshabilitado"
                                  }).then(() => {
                                    queryClient.invalidateQueries({ queryKey: ['cameras'] });
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

                            {/* Toggles de Modalidad de Grabación, Muro y Audio */}
                            <div className="grid grid-cols-3 gap-1.5 text-xs pt-1 border-t border-zinc-800/40">
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
                                <span className="text-[10px]">Grabar 24/7</span>
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

    </div>
  );
};

export default DeviceMgmt;
