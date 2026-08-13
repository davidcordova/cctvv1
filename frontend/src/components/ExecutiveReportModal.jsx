import React from 'react';
import { 
  Printer, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Server, 
  Video, 
  ShieldCheck, 
  Activity, 
  Calendar,
  Layers,
  Radio,
  FileSpreadsheet
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const ExecutiveReportModal = ({ isOpen, onClose }) => {
  const { user } = useAuth();

  const { data: summary, isLoading, isError } = useQuery({
    queryKey: ['executiveSummary'],
    queryFn: async () => {
      const res = await api.get('/reports/executive-summary');
      return res.data;
    },
    enabled: isOpen,
    refetchOnWindowFocus: false
  });

  if (!isOpen) return null;

  const kpis = summary?.kpis || {};
  const devices = summary?.devices || [];
  const incidents = summary?.recent_incidents || [];

  const getSlaBadge = (sla) => {
    if (sla >= 90) return { label: 'Excelente / Óptimo', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
    if (sla >= 75) return { label: 'Atención Requerida', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
    return { label: 'Crítico / Falla Operativa', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' };
  };

  const getDeviceHealthBadge = (health) => {
    switch (health) {
      case 'optimal':
        return { label: 'Óptimo (100% Canales)', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: CheckCircle2 };
      case 'warning':
        return { label: 'Advertencia (Canales Inactivos)', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30', icon: AlertTriangle };
      default:
        return { label: 'Crítico (DVR Desconectado)', bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30', icon: AlertCircle };
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:border-none print:shadow-none print:bg-white print:text-black">
        
        {/* Modal Top Bar (Hidden in Print) */}
        <div className="p-4 sm:p-6 bg-zinc-900/80 border-b border-zinc-800 flex justify-between items-center print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center text-blue-400">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Reporte Ejecutivo de Infraestructura CCTV</h2>
              <p className="text-xs text-zinc-400">Auditoría consolidada de disponibilidad, grabadores y cámaras</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/30 active:scale-95 cursor-pointer"
            >
              <Printer size={16} />
              Imprimir / Guardar PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content / Printable Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-8 print:p-6 print:space-y-6 print:text-black">
          
          {isLoading ? (
            <div className="py-20 text-center space-y-4">
              <div className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto" />
              <p className="text-zinc-400 text-sm">Generando consolidado ejecutivo...</p>
            </div>
          ) : isError || !summary ? (
            <div className="py-16 text-center text-rose-400">
              <AlertCircle size={40} className="mx-auto mb-2 opacity-50" />
              <p>Ocurrió un error al cargar los datos del reporte ejecutivo.</p>
            </div>
          ) : (
            <>
              {/* Document Header */}
              <div className="border-b border-zinc-800 print:border-zinc-300 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-blue-500/10 border border-blue-500/30 text-blue-400 print:border-blue-600 print:text-blue-700">
                      DOCUMENTO OFICIAL
                    </span>
                    <span className="text-xs text-zinc-500 print:text-zinc-600">CONFIDENCIAL</span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white print:text-black tracking-tight mt-1">
                    Reporte Ejecutivo de Seguridad & Videovigilancia
                  </h1>
                  <p className="text-xs text-zinc-400 print:text-zinc-600 mt-1">
                    Sistema Centralizado: <strong className="text-zinc-200 print:text-black">{summary.project_name}</strong> &bull; Emisión: {new Date(summary.generated_at).toLocaleString('es-PE')}
                  </p>
                </div>

                <div className="flex flex-col sm:items-end">
                  <span className="text-xs text-zinc-500 print:text-zinc-600">Responsable de Auditoría:</span>
                  <span className="text-sm font-bold text-zinc-200 print:text-black">{user?.full_name || 'Administrador del Sistema'}</span>
                  <span className="text-[11px] font-mono text-zinc-500 print:text-zinc-600 uppercase">Rol: {user?.role || 'ADMIN'}</span>
                </div>
              </div>

              {/* High-Level KPIs */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 print:text-zinc-700 mb-3 flex items-center gap-2">
                  <Activity size={16} className="text-blue-500" />
                  1. Indicadores Clave de Desempeño (KPIs de Alto Nivel)
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {/* Overall SLA */}
                  <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl print:bg-zinc-50 print:border-zinc-300">
                    <p className="text-xs text-zinc-500 print:text-zinc-600 font-semibold">Disponibilidad (SLA)</p>
                    <p className="text-2xl sm:text-3xl font-extrabold text-white print:text-black mt-1">
                      {kpis.overall_sla}%
                    </p>
                    <span className={`inline-block mt-2 px-2 py-0.5 rounded-md text-[10px] font-bold border ${getSlaBadge(kpis.overall_sla).color} print:border-zinc-400 print:text-zinc-800`}>
                      {getSlaBadge(kpis.overall_sla).label}
                    </span>
                  </div>

                  {/* DVRs Status */}
                  <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl print:bg-zinc-50 print:border-zinc-300">
                    <p className="text-xs text-zinc-500 print:text-zinc-600 font-semibold">Grabadores (DVR/NVR)</p>
                    <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400 print:text-emerald-700 mt-1">
                      {kpis.online_devices} <span className="text-sm font-normal text-zinc-500 print:text-zinc-600">/ {kpis.total_devices}</span>
                    </p>
                    <p className="text-[11px] text-zinc-400 print:text-zinc-600 mt-2">
                      {kpis.device_availability_pct}% equipos en línea
                    </p>
                  </div>

                  {/* Cameras Status */}
                  <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl print:bg-zinc-50 print:border-zinc-300">
                    <p className="text-xs text-zinc-500 print:text-zinc-600 font-semibold">Cámaras Operativas</p>
                    <p className="text-2xl sm:text-3xl font-extrabold text-blue-400 print:text-blue-700 mt-1">
                      {kpis.active_cameras} <span className="text-sm font-normal text-zinc-500 print:text-zinc-600">/ {kpis.total_cameras}</span>
                    </p>
                    <p className="text-[11px] text-zinc-400 print:text-zinc-600 mt-2">
                      {kpis.inactive_cameras > 0 ? `${kpis.inactive_cameras} canales apagados` : '100% transmitiendo'}
                    </p>
                  </div>

                  {/* Critical Alerts */}
                  <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl print:bg-zinc-50 print:border-zinc-300">
                    <p className="text-xs text-zinc-500 print:text-zinc-600 font-semibold">Incidentes Críticos</p>
                    <p className={`text-2xl sm:text-3xl font-extrabold mt-1 ${kpis.critical_events > 0 ? 'text-rose-400 print:text-rose-700' : 'text-zinc-200 print:text-black'}`}>
                      {kpis.critical_events}
                    </p>
                    <p className="text-[11px] text-zinc-400 print:text-zinc-600 mt-2">
                      {kpis.total_events} registros totales
                    </p>
                  </div>
                </div>
              </div>

              {/* DVRs & Cameras Breakdown */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 print:text-zinc-700 flex items-center gap-2">
                  <Server size={16} className="text-emerald-500" />
                  2. Evaluación Operativa por Grabador (DVR/NVR) y Cámaras
                </h3>

                <div className="space-y-4">
                  {devices.map((dev) => {
                    const health = getDeviceHealthBadge(dev.health_status);
                    const HealthIcon = health.icon;

                    return (
                      <div 
                        key={dev.id}
                        className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5 space-y-4 print:bg-white print:border-zinc-300 print:shadow-sm"
                      >
                        {/* DVR Header */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-zinc-800/80 print:border-zinc-200 pb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${dev.is_online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-rose-500'}`} />
                            <div>
                              <h4 className="text-base font-bold text-white print:text-black">{dev.name}</h4>
                              <span className="text-xs font-mono text-zinc-400 print:text-zinc-600">
                                {dev.host}:{dev.port} &bull; Marca: <strong>{dev.brand}</strong> &bull; Tipo: {dev.device_type} &bull; S/N: {dev.serial_number}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${health.bg} print:border-zinc-400`}>
                              <HealthIcon size={14} />
                              {health.label}
                            </span>
                            <span className="text-xs font-bold font-mono px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 print:bg-zinc-100 print:text-black print:border-zinc-300">
                              Canales: {dev.active_cameras} / {dev.channel_count}
                            </span>
                          </div>
                        </div>

                        {/* Cameras Chips / Grid */}
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 print:text-zinc-600 mb-2">
                            Estado de Canales Asignados:
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                            {dev.cameras.map((cam) => (
                              <div
                                key={cam.id}
                                className={`p-2.5 rounded-xl border flex flex-col justify-between text-xs transition-all ${
                                  cam.is_active
                                    ? 'bg-zinc-950/60 border-zinc-800 text-zinc-200 print:bg-zinc-50 print:border-zinc-300 print:text-black'
                                    : 'bg-rose-500/5 border-rose-500/20 text-rose-400 print:bg-rose-50 print:text-rose-800'
                                }`}
                              >
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-mono font-bold text-[10px] text-zinc-500 print:text-zinc-600">CH {cam.channel}</span>
                                  <span className={`w-2 h-2 rounded-full ${cam.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                </div>
                                <p className="font-semibold text-xs truncate" title={cam.name}>
                                  {cam.name}
                                </p>
                                <span className="text-[9px] mt-1 opacity-70 font-mono">
                                  {cam.is_active ? 'OPERATIVA' : 'DESHABILITADA'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Incidents Table */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 print:text-zinc-700 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-rose-500" />
                  3. Historial de Incidentes y Eventos Críticos Recientes
                </h3>

                {incidents.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 bg-zinc-900/30 border border-zinc-800 rounded-2xl">
                    <p className="text-xs italic">No se registraron incidentes críticos o fallas de conectividad recientes.</p>
                  </div>
                ) : (
                  <div className="border border-zinc-800 print:border-zinc-300 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-900/60 print:bg-zinc-100 border-b border-zinc-800 print:border-zinc-300">
                        <tr>
                          <th className="px-4 py-3 font-bold uppercase tracking-wider text-zinc-400 print:text-zinc-700">Fecha y Hora</th>
                          <th className="px-4 py-3 font-bold uppercase tracking-wider text-zinc-400 print:text-zinc-700">Evento</th>
                          <th className="px-4 py-3 font-bold uppercase tracking-wider text-zinc-400 print:text-zinc-700">Severidad</th>
                          <th className="px-4 py-3 font-bold uppercase tracking-wider text-zinc-400 print:text-zinc-700">Detalle Operativo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 print:divide-zinc-200">
                        {incidents.map((inc) => (
                          <tr key={inc.id} className="hover:bg-zinc-900/20">
                            <td className="px-4 py-2.5 font-mono text-zinc-400 print:text-zinc-600 whitespace-nowrap">
                              {new Date(inc.timestamp).toLocaleString('es-PE')}
                            </td>
                            <td className="px-4 py-2.5 font-bold text-zinc-200 print:text-black whitespace-nowrap">
                              {inc.event_type}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                inc.severity === 'error' ? 'text-rose-400 bg-rose-500/10' : 'text-amber-400 bg-amber-500/10'
                              } print:text-black`}>
                                {inc.severity}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-zinc-300 print:text-zinc-700">
                              {inc.description}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Signature / Audit Footer */}
              <div className="pt-8 border-t border-zinc-800 print:border-zinc-300 grid grid-cols-2 gap-8 text-center text-xs text-zinc-500 print:text-zinc-600">
                <div className="space-y-6">
                  <div className="border-b border-zinc-700 print:border-zinc-400 w-48 mx-auto" />
                  <p>Firma Responsable de Seguridad / TI</p>
                </div>
                <div className="space-y-6">
                  <div className="border-b border-zinc-700 print:border-zinc-400 w-48 mx-auto" />
                  <p>V° B° Gerencia de Operaciones</p>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
};

export default ExecutiveReportModal;
