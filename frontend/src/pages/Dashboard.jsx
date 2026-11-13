import React, { useMemo } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Video,
  ChevronRight,
  Server,
  HardDrive,
  FileCheck2,
  Cpu,
  WifiOff,
  Check
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { formatStorageInfo } from '../utils/storageUtils';

const StatCard = ({ icon: Icon, label, value, subtitle, color, accentBorder = 'border-zinc-800/80', onClick }) => (
  <div 
    onClick={onClick}
    className={`card-zinc !p-4 sm:!p-5 flex flex-col justify-between gap-3 ${accentBorder} ${
      onClick ? 'cursor-pointer hover:bg-zinc-800/40 hover:border-zinc-700 transition-all active:scale-[0.99]' : ''
    }`}
  >
    <div className="flex justify-between items-start gap-2">
      <div className={`p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 ${color}`}>
        <Icon size={20} />
      </div>
      {subtitle && (
        <span className="text-[11px] font-mono text-zinc-400 bg-zinc-950/90 px-2 py-0.5 rounded-md border border-zinc-800/80 truncate max-w-[150px]">
          {subtitle}
        </span>
      )}
    </div>
    <div>
      <p className="text-xs sm:text-sm text-zinc-400 font-medium">{label}</p>
      <p className="text-2xl sm:text-3xl font-black mt-0.5 tracking-tight text-white">{value}</p>
    </div>
  </div>
);

const timeAgo = (dateString) => {
  if (!dateString) return 'Desconocido';
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Hace un momento';
  if (diffMins < 60) return `Hace ${diffMins} min${diffMins > 1 ? 's' : ''}`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Hace ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
  return date.toLocaleDateString();
};

const Dashboard = () => {
  const navigate = useNavigate();

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const res = await api.get('/devices/');
      return res.data;
    }
  });

  const { data: cameras = [] } = useQuery({
    queryKey: ['cameras'],
    queryFn: async () => {
      const res = await api.get('/cameras/');
      return res.data;
    }
  });

  const { data: reports = [] } = useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      const res = await api.get('/reports/');
      return res.data;
    }
  });

  const metrics = useMemo(() => {
    const installedCams = cameras.filter(c => c.is_installed !== false);
    const freePorts = cameras.length - installedCams.length;
    const operativeCams = installedCams.filter(c => c.is_active && c.has_video_signal !== false).length;

    const onlineDevs = devices.filter(d => d.is_online);
    const availPct = devices.length > 0 ? Math.round((onlineDevs.length / devices.length) * 100) : 100;

    let totalGb = 0;
    let freeGb = 0;
    let healthyStorageCount = 0;
    let syncedClockCount = 0;
    let driftedClockCount = 0;

    devices.forEach((d) => {
      const st = formatStorageInfo(
        d.hdd_capacity_total_gb,
        d.hdd_capacity_free_gb,
        d.storage_media_type,
        d.hdd_status,
        d.is_online
      );
      if (d.is_online) {
        if (st.isOk) healthyStorageCount++;
        if (d.hdd_capacity_total_gb && d.hdd_capacity_total_gb > 0) {
          totalGb += d.hdd_capacity_total_gb;
          freeGb += Math.max(0, d.hdd_capacity_free_gb || 0);
        }

        const offsetSec = Math.abs(d.time_offset_seconds ?? 0);
        if (d.device_time && offsetSec <= 300) {
          syncedClockCount++;
        } else {
          driftedClockCount++;
        }
      }
    });

    const totalTbStr = totalGb >= 1000 ? `${(totalGb / 1024).toFixed(2)} TB` : `${totalGb.toFixed(0)} GB`;
    const freePct = totalGb > 0 ? Math.round((freeGb / totalGb) * 100) : 0;

    return {
      installedTotal: installedCams.length,
      operativeCams,
      freePorts,
      onlineCount: onlineDevs.length,
      availPct,
      totalTbStr,
      freePct,
      healthyStorageCount,
      syncedClockCount,
      driftedClockCount,
    };
  }, [cameras, devices]);

  const criticalAlerts = reports.filter(r => r.severity === 'error').length;
  const recentEvents = reports.slice(0, 6);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500 max-w-[1800px] mx-auto">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Centro de Comando VMS</h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Supervisión en tiempo real de infraestructura, discos duros (HDD), reloj de grabadores y canales CCTV.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/wall')}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <Video size={15} />
            <span>Muro en Vivo</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <FileCheck2 size={15} className="text-emerald-400" />
            <span>Informes Ejecutivos</span>
          </button>
        </div>
      </header>

      {/* Fila de 4 KPIs Reales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
        <StatCard 
          icon={CheckCircle2} 
          label="Cámaras Instaladas Operativas" 
          value={`${metrics.operativeCams}/${metrics.installedTotal}`} 
          subtitle={`${metrics.freePorts} puertos libres`}
          color="text-emerald-400" 
          onClick={() => navigate('/wall')}
        />
        <StatCard 
          icon={Server} 
          label="Grabadores & IPC Online" 
          value={`${metrics.onlineCount}/${devices.length}`} 
          subtitle={`${metrics.availPct}% disponibilidad`}
          color="text-blue-400" 
          onClick={() => navigate('/devices')}
        />
        <StatCard 
          icon={HardDrive} 
          label="Almacenamiento Total (HDD)" 
          value={metrics.totalTbStr} 
          subtitle={`${metrics.healthyStorageCount}/${devices.length} OK (${metrics.freePct}% libre)`}
          color="text-purple-400" 
          onClick={() => navigate('/devices')}
        />
        <StatCard 
          icon={metrics.driftedClockCount > 0 ? AlertTriangle : Clock} 
          label="Sincronización Horaria" 
          value={`${metrics.syncedClockCount}/${metrics.onlineCount}`} 
          subtitle={metrics.driftedClockCount > 0 ? `${metrics.driftedClockCount} desfasado(s)` : `${criticalAlerts} alertas crit.`}
          color={metrics.driftedClockCount > 0 ? 'text-amber-400' : 'text-cyan-400'} 
          accentBorder={metrics.driftedClockCount > 0 ? 'border-amber-500/30' : 'border-zinc-800/80'}
          onClick={() => navigate('/devices')}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Panel Principal (2/3): Salud de Grabadores y Discos en Tiempo Real */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
              <Cpu className="text-blue-500" size={19} />
              Salud de Grabadores, Discos y Reloj
            </h2>
            <button 
              onClick={() => navigate('/devices')}
              className="text-xs sm:text-sm text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              Administrar <ChevronRight size={15} />
            </button>
          </div>

          {devices.length === 0 ? (
            <div className="card-zinc py-12 text-center text-zinc-500 text-sm">
              No hay dispositivos adoptados en el sistema.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {devices.map((dev) => {
                const storage = formatStorageInfo(
                  dev.hdd_capacity_total_gb,
                  dev.hdd_capacity_free_gb,
                  dev.storage_media_type,
                  dev.hdd_status,
                  dev.is_online
                );
                const offsetSec = Math.abs(dev.time_offset_seconds ?? 0);
                const isClockOk = dev.is_online && dev.device_time && offsetSec <= 300;
                const devCams = cameras.filter(c => c.device_id === dev.id && c.is_installed !== false);
                const devLiveCams = devCams.filter(c => c.is_active && c.has_video_signal !== false).length;
                const usedBarColor =
                  storage.percentUsed >= 95 ? 'bg-blue-500' :
                  storage.percentUsed >= 80 ? 'bg-amber-500' :
                  'bg-emerald-500';

                return (
                  <div
                    key={dev.id}
                    onClick={() => navigate('/devices')}
                    className={`card-zinc !p-4 space-y-3 cursor-pointer hover:bg-zinc-800/40 transition-all border ${
                      !dev.is_online ? 'border-rose-500/30 opacity-85' : 'border-zinc-800/90 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            dev.is_online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]' : 'bg-rose-500'
                          }`} />
                          <h3 className="font-bold text-sm text-white truncate">{dev.name}</h3>
                        </div>
                        <p className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">
                          {dev.host} • {dev.model || dev.brand} ({dev.device_type})
                        </p>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-300 shrink-0">
                        {devLiveCams}/{devCams.length} cam
                      </span>
                    </div>

                    {/* Almacenamiento */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-400 flex items-center gap-1.5 truncate">
                          <HardDrive size={12} className="text-zinc-500 shrink-0" />
                          <span className="truncate">{storage.primary}</span>
                        </span>
                        <span className={`font-semibold shrink-0 ${storage.isOk ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {storage.badge}
                        </span>
                      </div>

                      {dev.is_online && dev.hdd_capacity_total_gb > 0 && (
                        <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/80">
                          <div
                            className={`h-full rounded-full transition-all ${usedBarColor}`}
                            style={{ width: `${Math.min(100, Math.max(4, storage.percentUsed))}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Estado de Reloj / Sincronización Horaria */}
                    <div className="pt-2 border-t border-zinc-800/70 flex items-center justify-between text-[11px]">
                      {!dev.is_online ? (
                        <span className="text-rose-400 flex items-center gap-1 font-medium">
                          <WifiOff size={12} /> Sin conexión en red
                        </span>
                      ) : isClockOk ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-medium">
                          <Check size={12} /> Reloj sincronizado ({offsetSec}s)
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center gap-1 font-medium">
                          <Clock size={12} /> {dev.device_time ? `Desfase ${Math.round(offsetSec / 60)} min` : 'Reloj pendiente'}
                        </span>
                      )}
                      <span className="text-zinc-500 font-mono truncate max-w-[140px]">
                        {storage.secondary}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel Lateral (1/3): Acciones Rápidas + Bitácora Reciente */}
        <div className="space-y-5">
          <div className="space-y-3">
            <h2 className="text-base sm:text-lg font-bold px-1 text-white">Acciones Rápidas</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-2.5">
              <button 
                onClick={() => navigate('/wall')}
                className="card-zinc !p-3.5 text-left hover:bg-zinc-800/60 transition-all group flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-600/15 text-blue-400">
                    <Video size={17} />
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-white block">Muro Multicámara</span>
                    <span className="text-[11px] text-zinc-500">Vista fluida 1x1 a 5x5</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-300" />
              </button>

              <button 
                onClick={() => navigate('/reports')}
                className="card-zinc !p-3.5 text-left hover:bg-zinc-800/60 transition-all group flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-600/15 text-emerald-400">
                    <FileCheck2 size={17} />
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-white block">Generar Reporte SLA</span>
                    <span className="text-[11px] text-zinc-500">Auditoría fotográfica y firmas</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-300" />
              </button>

              <button 
                onClick={() => navigate('/devices')}
                className="card-zinc !p-3.5 text-left hover:bg-zinc-800/60 transition-all group flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-600/15 text-amber-400">
                    <Server size={17} />
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-white block">Gestionar Grabadores</span>
                    <span className="text-[11px] text-zinc-500">Hora, HDD, ONVIF y puertos</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-300" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-base font-bold flex items-center gap-2 text-white">
                <ShieldCheck className="text-blue-500" size={18} />
                Eventos Recientes
              </h2>
              <button 
                onClick={() => navigate('/reports')}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5 cursor-pointer"
              >
                Ver todo <ChevronRight size={14} />
              </button>
            </div>

            <div className="space-y-2">
              {recentEvents.length === 0 ? (
                <div className="card-zinc py-8 text-center text-zinc-500 text-xs italic">
                  No hay eventos recientes registrados.
                </div>
              ) : (
                recentEvents.map(event => (
                  <div 
                    key={event.id} 
                    onClick={() => navigate('/reports')}
                    className="card-zinc !p-3 flex items-center justify-between gap-2.5 hover:bg-zinc-800/40 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                        event.severity === 'error' ? 'bg-rose-500/10 text-rose-500' : 
                        event.severity === 'warning' ? 'bg-amber-500/10 text-amber-500' : 
                        'bg-blue-500/10 text-blue-500'
                      }`}>
                        <Activity size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-xs sm:text-sm text-zinc-200 truncate">{event.event_type}</p>
                        <p className="text-[11px] text-zinc-500 truncate">{event.description}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 font-mono shrink-0">
                      {timeAgo(event.timestamp)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
