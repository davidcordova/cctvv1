import React, { useState } from 'react';
import { 
  Printer, 
  X, 
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Server,
  Activity,
  FileCheck2,
  HardDrive,
  Clock,
  Video,
  Radio,
  Layers,
  Disc,
  Image as ImageIcon,
  Camera as CameraIcon,
  FileSignature,
  BadgeCheck,
  CheckCheck,
  KeyRound,
  RotateCcw,
  Plus,
  History,
  FileText
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { formatStorageInfo } from '../utils/storageUtils';
import { useAuth } from '../context/AuthContext';

const ExecutiveReportModal = ({ isOpen, onClose, initialReportCode = null }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [signingRole, setSigningRole] = useState(null);
  const [selectedReportCode, setSelectedReportCode] = useState(initialReportCode);
  const [isGeneratingNew, setIsGeneratingNew] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedReportCode(initialReportCode || null);
    }
  }, [isOpen, initialReportCode]);

  // Consulta del informe ejecutivo activo o seleccionado
  const { data: summary, isLoading, isError, isFetching } = useQuery({
    queryKey: ['executiveSummary', selectedReportCode],
    queryFn: async () => {
      const params = {};
      if (selectedReportCode) {
        params.report_code = selectedReportCode;
      }
      const res = await api.get('/reports/executive-summary', { params });
      return res.data;
    },
    enabled: isOpen,
    refetchOnWindowFocus: false
  });

  // Consulta del historial de informes generados
  const { data: history = [] } = useQuery({
    queryKey: ['auditReportsHistory'],
    queryFn: async () => {
      const res = await api.get('/reports/history');
      return res.data;
    },
    enabled: isOpen
  });

  // Generar un nuevo informe oficial con nuevo correlativo consecutivo
  const handleGenerateNew = async () => {
    setIsGeneratingNew(true);
    try {
      const res = await api.get('/reports/executive-summary', { params: { force_new: true } });
      if (res.data && res.data.report_code) {
        setSelectedReportCode(res.data.report_code);
        queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
        queryClient.invalidateQueries({ queryKey: ['auditReportsHistory'] });
      }
    } catch (err) {
      alert("Error al generar nuevo informe: " + (err.response?.data?.detail || err.message));
    } finally {
      setIsGeneratingNew(false);
    }
  };

  const signMutation = useMutation({
    mutationFn: async (roleType) => {
      setSigningRole(roleType);
      const res = await api.post(`/reports/${summary.report_code}/sign`, null, {
        params: { role_type: roleType }
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
      queryClient.invalidateQueries({ queryKey: ['auditReportsHistory'] });
      setSigningRole(null);
    },
    onError: (err) => {
      alert("Error al registrar la firma digital: " + (err.response?.data?.detail || err.message));
      setSigningRole(null);
    }
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/reports/${summary.report_code}/reset-signatures`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
      queryClient.invalidateQueries({ queryKey: ['auditReportsHistory'] });
    },
    onError: (err) => {
      alert("Error al reiniciar firmas: " + (err.response?.data?.detail || err.message));
    }
  });

  if (!isOpen) return null;

  const kpis = summary?.kpis || {};
  const devices = summary?.devices || [];
  const incidents = summary?.recent_incidents || [];
  const signatures = summary?.signatures || {};
  const techSig = signatures.technician || {};
  const coordSig = signatures.coordinator || {};
  const reportTimeKey = summary?.generated_at ? new Date(summary.generated_at).getTime() : Date.now();

  const userRoleStr = String(user?.role?.value || user?.role || '').toLowerCase();
  const isAdmin = userRoleStr === 'admin' || user?.username === 'admin';

  const handlePrint = () => {
    const originalTitle = document.title;
    const filename = summary?.pdf_filename || `${summary?.report_code || 'INF-CCTV'}_Informe_Ejecutivo_CCTV`;
    document.title = filename;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 2500);
  };

  // Veredicto formal
  const getOverallVerdict = (sla, unhealthyHdd, driftedCount) => {
    if (unhealthyHdd > 0 || sla < 75) {
      return { text: 'NO CONFORME / CRÍTICO (REVISAR ALMACENAMIENTO)', color: 'bg-rose-50 text-rose-900 border-rose-400' };
    }
    if (sla >= 92 && driftedCount === 0) {
      return { text: 'CONFORME / ÓPTIMO', color: 'bg-emerald-50 text-emerald-800 border-emerald-300' };
    }
    return { text: 'CONFORME CON OBSERVACIONES', color: 'bg-amber-50 text-amber-900 border-amber-400' };
  };

  const verdict = getOverallVerdict(kpis.overall_sla || 0, kpis.hdd_unhealthy_devices || 0, kpis.drifted_devices_count || 0);
  const completedSignaturesCount = (techSig.signed ? 1 : 0) + (coordSig.signed ? 1 : 0);

  return (
    <div 
      id="executive-report-modal-wrapper"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 print:p-0 print:bg-white print:static print:overflow-visible print:inset-auto"
    >
      {/* Modal Main Frame */}
      <div 
        id="executive-report-modal-frame"
        className="bg-white text-slate-900 rounded-xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] print:max-h-none print:border-none print:shadow-none print:bg-white print:rounded-none print:w-full print:m-0 print:p-0"
      >
        
        {/* Top Control Bar (Screen only) */}
        <div className="p-3.5 bg-slate-900 text-white border-b border-slate-800 flex flex-wrap justify-between items-center gap-3 print:hidden no-print">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shrink-0">
              <FileCheck2 size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider">Informe Técnico Ejecutivo</h2>
                <span className="font-mono text-[10px] bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-700/60 font-bold">
                  {summary?.report_code || 'INF-CCTV'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Verificación de Discos Duros (HDD), Modalidad de Grabación y Firmas Digitales</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Selector de Historial de Informes */}
            {history.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 text-xs">
                <History size={13} className="text-slate-400" />
                <select
                  value={selectedReportCode || summary?.report_code || ''}
                  onChange={(e) => setSelectedReportCode(e.target.value)}
                  className="bg-transparent text-slate-200 font-mono text-[11px] outline-none cursor-pointer font-bold"
                  title="Cambiar a otro informe generado previamente"
                >
                  {history.map((h) => (
                    <option key={h.id} value={h.report_code} className="bg-slate-900 text-white">
                      {h.report_code} ({new Date(h.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Botón para Generar Nuevo Informe con Nuevo Correlativo */}
            <button
              type="button"
              onClick={handleGenerateNew}
              disabled={isGeneratingNew}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow active:scale-95 cursor-pointer"
              title="Generar un nuevo informe de auditoría con nuevo código correlativo"
            >
              <Plus size={14} className={isGeneratingNew ? 'animate-spin' : ''} />
              <span>{isGeneratingNew ? 'Generando...' : 'Nuevo Informe (+)'}</span>
            </button>

            {/* Botón de Reinicio de Firmas (Solo Admin si hay firmas) */}
            {isAdmin && completedSignaturesCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("¿Deseas reiniciar las firmas digitales de este informe para un nuevo proceso de validación?")) {
                    resetMutation.mutate();
                  }
                }}
                disabled={resetMutation.isPending}
                className="flex items-center gap-1 bg-zinc-800 hover:bg-rose-900/60 text-zinc-300 hover:text-rose-200 border border-zinc-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                title="Reiniciar firmas digitales de este informe"
              >
                <RotateCcw size={12} className={resetMutation.isPending ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Limpiar Firmas</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <Printer size={14} />
              Imprimir / PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Cuerpo del Documento Formal */}
        <div className="p-6 sm:p-10 overflow-y-auto print:p-0 print:overflow-visible">
          <div 
            id="executive-report-document"
            className="bg-white text-slate-900 mx-auto max-w-[850px] space-y-6 print:max-w-none text-[9.5pt] leading-relaxed font-sans"
          >
            {isLoading || isFetching ? (
              <div className="py-24 text-center space-y-4">
                <div className="w-10 h-10 border-3 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto" />
                <p className="text-slate-600 text-sm font-medium">Consolidando métricas e informe de auditoría de CCTV...</p>
              </div>
            ) : isError || !summary ? (
              <div className="py-16 text-center text-red-600 space-y-2">
                <AlertCircle size={44} className="mx-auto text-red-500" />
                <p className="font-bold">No fue posible generar el informe ejecutivo.</p>
                <p className="text-xs text-slate-500">Compruebe la conexión con el servidor backend.</p>
              </div>
            ) : (
              <>
                {/* ==================================================================== */}
                {/* 1. DATOS GENERALES DEL INFORME / REPORTE                             */}
                {/* ==================================================================== */}
                <div className="border-b-2 border-slate-900 pb-4 space-y-4 page-break-avoid">
                  {/* Membrete Superior */}
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-slate-900 font-black text-sm tracking-wider uppercase">
                        <Shield size={22} className="text-blue-700 fill-blue-700/10" />
                        <span>SISTEMA CENTRALIZADO DE SEGURIDAD &amp; VIDEOVIGILANCIA</span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-semibold uppercase tracking-wide">
                        DIVISIÓN DE INFRAESTRUCTURA, CIBERSEGURIDAD Y CONTROL OPERATIVO
                      </p>
                    </div>

                    {/* Caja de Control Documentario con Correlativo Único */}
                    <div className="border border-slate-300 bg-slate-50 p-2.5 rounded text-[9pt] font-mono space-y-0.5 min-w-[240px] shrink-0">
                      <div><strong className="text-slate-700">CÓDIGO ÚNICO:</strong> <span className="font-black text-blue-900">{summary.report_code}</span></div>
                      <div><strong className="text-slate-700">CORRELATIVO:</strong> N° <span className="font-bold text-slate-900">{String(summary.report_sequence || 1).padStart(4, '0')}</span></div>
                      <div>
                        <strong className="text-slate-700">ESTADO:</strong>{' '}
                        <span className={`font-bold ${
                          completedSignaturesCount === 2 
                            ? 'text-emerald-700' 
                            : completedSignaturesCount === 1 
                            ? 'text-amber-700' 
                            : summary.status === 'rejected'
                            ? 'text-rose-700'
                            : 'text-zinc-600'
                        }`}>
                          {completedSignaturesCount === 2 
                            ? 'APROBADO / CONFORME' 
                            : completedSignaturesCount === 1 
                            ? 'EMITIDO (ESPERA V° B°)' 
                            : summary.status === 'rejected'
                            ? 'RECHAZADO'
                            : 'BORRADOR (VISTA PREVIA)'}
                        </span>
                      </div>
                      <div><strong className="text-slate-700">CLASIFICACIÓN:</strong> <span className="font-bold text-red-700">CONFIDENCIAL</span></div>
                      <div><strong className="text-slate-700">EMISIÓN:</strong> {new Date(summary.generated_at).toLocaleDateString('es-PE')}</div>
                    </div>
                  </div>

                  {/* Título Principal */}
                  <div>
                    <h1 className="text-xl sm:text-2xl font-black text-slate-950 uppercase tracking-tight">
                      Informe Ejecutivo de Auditoría, Grabación y Estado Operativo CCTV
                    </h1>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Auditoría integral de integridad de almacenamiento (HDD), modalidad de grabación activa, sincronización horaria y validación de firmas digitales.
                    </p>
                  </div>

                  {/* Tabla de Datos Generales del Informe */}
                  <div className="border border-slate-300 rounded overflow-hidden text-xs">
                    <table className="w-full text-left border-collapse">
                      <tbody>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <td className="p-2 font-bold text-slate-700 w-1/4 bg-slate-100 border-r border-slate-200">Sistema / Entorno:</td>
                          <td className="p-2 text-slate-900 w-1/4 border-r border-slate-200 font-semibold">{summary.project_name}</td>
                          <td className="p-2 font-bold text-slate-700 w-1/4 bg-slate-100 border-r border-slate-200">Usuario en Sesión:</td>
                          <td className="p-2 text-slate-900 w-1/4 font-semibold">{user?.full_name || user?.username || 'Administrador'}</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                          <td className="p-2 font-bold text-slate-700 bg-slate-100 border-r border-slate-200">Fecha y Hora de Emisión:</td>
                          <td className="p-2 text-slate-900 font-mono border-r border-slate-200">{new Date(summary.generated_at).toLocaleString('es-PE')}</td>
                          <td className="p-2 font-bold text-slate-700 bg-slate-100 border-r border-slate-200">Rol / Perfil:</td>
                          <td className="p-2 text-slate-900 uppercase font-semibold">
                            {isAdmin ? 'Coordinador de TI (Admin)' : 'Técnico de Soporte (Operador)'}
                          </td>
                        </tr>
                        <tr className="bg-slate-50">
                          <td className="p-2 font-bold text-slate-700 bg-slate-100 border-r border-slate-200">Dictamen Global:</td>
                          <td colSpan={3} className="p-2">
                            <span className={`inline-block px-2.5 py-0.5 rounded font-bold text-[10px] tracking-wide uppercase border ${verdict.color}`}>
                              {summary.status === 'rejected' ? 'RECHAZADO POR COORDINACIÓN' : verdict.text} (SLA: {kpis.overall_sla}%)
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Banner de Informe Rechazado */}
                  {summary.status === 'rejected' && (
                    <div className="bg-rose-50 border-2 border-rose-500 rounded-lg p-3 text-rose-950 flex items-start gap-3 page-break-avoid">
                      <AlertCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-xs font-black text-rose-900 uppercase">INFORME RECHAZADO POR COORDINACIÓN DE TI</strong>
                          <span className="text-[9px] font-mono bg-rose-200 text-rose-900 px-2 py-0.5 rounded font-bold">
                            Rechazado por: @{summary.rejected_by || 'admin'} &bull; {summary.rejected_at ? new Date(summary.rejected_at).toLocaleString('es-PE') : ''}
                          </span>
                        </div>
                        <p className="text-[10px] text-rose-900 font-medium">
                          <strong>Motivo de Rechazo:</strong> {summary.rejection_reason || 'Sin justificación especificada.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* ==================================================================== */}
                {/* 2. RESUMEN EJECUTIVO Y SLA CONSOLIDADO                               */}
                {/* ==================================================================== */}
                <div className="space-y-3 page-break-avoid">
                  <div className="flex items-center gap-2 border-b border-slate-300 pb-1">
                    <span className="bg-slate-900 text-white w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold">1</span>
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                      Resumen Ejecutivo y Nivel de Cumplimiento (SLA)
                    </h2>
                  </div>

                  <p className="text-slate-700 text-justify text-[9pt] leading-normal">
                    El presente informe técnico valida la <strong>efectividad de grabación, salud del almacenamiento y respaldo de evidencia fotográfica</strong> sobre las cámaras físicamente instaladas en servicio. 
                    Actualmente, el sistema opera con un <strong>Nivel de Servicio Consolidado (SLA) del {kpis.overall_sla}%</strong>. 
                    Se registran <strong>{kpis.online_devices} de {kpis.total_devices} grabadores en línea ({kpis.device_availability_pct}%)</strong>, 
                    con <strong>{kpis.installed_cameras} cámaras físicamente instaladas de una capacidad total de {kpis.total_ports || 32} puertos ({kpis.free_ports || 0} puertos libres en reserva)</strong>. 
                    El <strong>{kpis.recording_compliance_pct}% de las cámaras instaladas ({kpis.recording_cameras} de {kpis.installed_cameras})</strong> se encuentra en grabación continua activa (24/7), 
                    con un <strong>{kpis.evidence_compliance_pct || 100}% de evidencia fotográfica verificada ({kpis.verified_cameras_count || kpis.installed_cameras} de {kpis.installed_cameras})</strong>. 
                    El <strong>{kpis.hdd_health_pct}% de los grabadores ({kpis.hdd_healthy_devices}/{kpis.total_devices})</strong> cuenta con almacenamiento en formato correcto.
                    {kpis.drifted_devices_count > 0 ? (
                      ` ⚠️ Atención: Se identificaron ${kpis.drifted_devices_count} grabadores con desfase horario > 5 min respecto al servidor.`
                    ) : (
                      ' Todos los grabadores se encuentran sincronizados con la hora del servidor local.'
                    )}
                  </p>

                  {/* Fichas / Tarjetas Métricas de KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                    <div className="border border-slate-300 p-2.5 rounded-lg bg-slate-50 text-center">
                      <div className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wide">SLA Operativo</div>
                      <div className="text-xl font-black text-slate-900 mt-0.5">{kpis.overall_sla}%</div>
                      <div className="text-[8.5px] font-bold text-emerald-700 uppercase mt-0.5">Meta: &gt;90%</div>
                    </div>

                    <div className="border border-slate-300 p-2.5 rounded-lg bg-slate-50 text-center">
                      <div className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wide">Grabando (24/7)</div>
                      <div className="text-xl font-black text-rose-700 mt-0.5">{kpis.recording_cameras}/{kpis.installed_cameras}</div>
                      <div className="text-[8.5px] font-bold text-slate-600 uppercase mt-0.5">
                        {kpis.not_recording_cameras > 0 ? `${kpis.not_recording_cameras} con falla` : '100% graban'}
                      </div>
                    </div>

                    <div className="border border-slate-300 p-2.5 rounded-lg bg-slate-50 text-center">
                      <div className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wide">Evidencia Visual</div>
                      <div className="text-xl font-black text-blue-700 mt-0.5">{kpis.verified_cameras_count || kpis.installed_cameras}/{kpis.installed_cameras}</div>
                      <div className="text-[8.5px] font-bold text-emerald-700 uppercase mt-0.5">{kpis.evidence_compliance_pct || 100}% Fotos OK</div>
                    </div>

                    <div className="border border-slate-300 p-2.5 rounded-lg bg-slate-50 text-center">
                      <div className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wide">Discos Duros</div>
                      <div className="text-xl font-black text-emerald-700 mt-0.5">{kpis.hdd_healthy_devices}/{kpis.total_devices}</div>
                      <div className="text-[8.5px] font-bold text-slate-600 uppercase mt-0.5">Formato Correcto</div>
                    </div>

                    <div className="border border-slate-300 p-2.5 rounded-lg bg-slate-50 text-center">
                      <div className="text-[9.5px] uppercase font-bold text-slate-500 tracking-wide">Desfase Horario</div>
                      <div className={`text-xl font-black mt-0.5 ${kpis.drifted_devices_count > 0 ? 'text-amber-700' : 'text-slate-900'}`}>
                        {kpis.drifted_devices_count}
                      </div>
                      <div className="text-[8.5px] font-bold text-slate-600 uppercase mt-0.5">&gt; 5 min de desfase</div>
                    </div>
                  </div>
                </div>

                {/* ==================================================================== */}
                {/* 3. DETALLES POR SECCIONES                                            */}
                {/* ==================================================================== */}

                {/* SECCIÓN 1: MATRIZ DE INFRAESTRUCTURA, ALMACENAMIENTO (HDD) Y HORA */}
                <div className="space-y-3 page-break-avoid">
                  <div className="flex items-center gap-2 border-b border-slate-300 pb-1">
                    <span className="bg-slate-900 text-white w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold">2</span>
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                      Matriz de Grabadores, Estado de Disco Duro (HDD) y Sincronización Horaria
                    </h2>
                  </div>

                  <div className="border border-slate-300 rounded overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 uppercase text-[9px]">
                        <tr>
                          <th className="p-2 border-r border-slate-200 text-center w-7">N°</th>
                          <th className="p-2 border-r border-slate-200 w-32">Grabador / Red</th>
                          <th className="p-2 border-r border-slate-200 w-40">Disco Duro (HDD) &amp; Salud</th>
                          <th className="p-2 border-r border-slate-200 w-36">Sincronización Horaria</th>
                          <th className="p-2 border-r border-slate-200 text-center w-32">Cámaras / Grabación</th>
                          <th className="p-2 text-center w-24">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-[9.5px]">
                        {devices.map((dev, idx) => {
                          const hddOk = dev.hdd_is_ok;
                          const isDrifted = dev.is_time_drifted;
                          const hasUnrecorded = dev.recording_cameras < dev.installed_cameras;

                          return (
                            <tr key={dev.id} className="hover:bg-slate-50">
                              <td className="p-2 border-r border-slate-200 text-center font-bold text-slate-500">{idx + 1}</td>
                              
                              <td className="p-2 border-r border-slate-200 font-bold text-slate-900">
                                {dev.name}
                                <div className="text-[8.5px] font-normal text-slate-600 font-mono">{dev.host}:{dev.port} &bull; {dev.brand}</div>
                              </td>

                              <td className="p-2 border-r border-slate-200">
                                {(() => {
                                  const st = formatStorageInfo(dev.hdd_total_gb, dev.hdd_free_gb, dev.storage_media_type, dev.hdd_status, dev.is_online);
                                  return (
                                    <>
                                      <div className="flex items-center gap-1 font-semibold">
                                        <HardDrive size={12} className={hddOk ? 'text-emerald-700' : 'text-rose-700'} />
                                        <span className={hddOk ? 'text-emerald-900' : 'text-rose-900 font-bold'}>
                                          {st.badge}
                                        </span>
                                      </div>
                                      <div className="text-[8.5px] font-bold text-slate-800 font-mono mt-0.5">
                                        {st.primary}
                                      </div>
                                      <div className="text-[8px] text-slate-500 font-mono">
                                        {st.secondary}
                                      </div>
                                    </>
                                  );
                                })()}
                              </td>

                              <td className="p-2 border-r border-slate-200 font-mono">
                                <div className="flex items-center gap-1 font-sans font-semibold">
                                  <Clock size={12} className={isDrifted ? 'text-rose-600' : 'text-blue-700'} />
                                  <span className={isDrifted ? 'text-rose-800 font-bold' : 'text-slate-800'}>
                                    {isDrifted ? `⚠️ Desfase: ${Math.round((dev.time_offset_seconds || 0)/60)} min` : 'Sincronizado OK'}
                                  </span>
                                </div>
                                <div className="text-[8.5px] text-slate-500 font-mono mt-0.5">
                                  {dev.device_time ? `Hora: ${new Date(dev.device_time).toLocaleTimeString('es-PE')}` : 'Sin datos'}
                                </div>
                              </td>

                              <td className="p-2 border-r border-slate-200 text-center">
                                <div className="font-bold text-slate-900">
                                  {dev.recording_cameras} / {dev.installed_cameras} Grabando
                                </div>
                                <div className="text-[8.5px] text-slate-500 font-mono">
                                  ({dev.free_ports} puertos libres en reserva)
                                </div>
                              </td>

                              <td className="p-2 text-center">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase border ${
                                  !dev.is_online || !hddOk
                                    ? 'bg-rose-50 text-rose-800 border-rose-300'
                                    : isDrifted || hasUnrecorded
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                }`}>
                                  {!dev.is_online ? 'DESCONECTADO' : !hddOk ? 'FALLA HDD' : isDrifted || hasUnrecorded ? 'OBSERVADO' : 'ÓPTIMO'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* SECCIÓN 2: DETALLE DE CANALES Y MODALIDAD DE GRABACIÓN */}
                <div className="space-y-3 page-break-avoid">
                  <div className="flex items-center gap-2 border-b border-slate-300 pb-1">
                    <span className="bg-slate-900 text-white w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold">3</span>
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                      Detalle de Cobertura, Señal de Video y Modalidad de Grabación por Cámara
                    </h2>
                  </div>

                  <div className="space-y-3">
                    {devices.map((dev) => (
                      <div key={dev.id} className="border border-slate-300 rounded p-2.5 bg-slate-50/50 space-y-2">
                        <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                          <span className="font-bold text-xs text-slate-900">{dev.name} ({dev.host})</span>
                          <span className="text-[10px] font-mono text-slate-600">
                            Grabando: <strong className="text-rose-700">{dev.recording_cameras}</strong> / {dev.installed_cameras} instaladas ({dev.free_ports} libres)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {(dev.cameras || []).map((cam) => {
                            const isInstalled = cam.is_installed ?? true;
                            const isRec = cam.is_recording;
                            const isAct = cam.is_active;

                            return (
                              <div 
                                key={cam.id}
                                className={`p-2 rounded border text-[9px] flex flex-col justify-between ${
                                  !isInstalled 
                                    ? 'bg-slate-100/70 border-slate-200 text-slate-400' 
                                    : !isRec
                                    ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold'
                                    : 'bg-white border-slate-200 text-slate-900'
                                }`}
                              >
                                <div className="flex justify-between items-center mb-0.5 font-mono">
                                  <span className="font-bold">CH {cam.channel}</span>
                                  <span className={`w-2 h-2 rounded-full ${!isInstalled ? 'bg-slate-300' : isAct ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                                </div>
                                <p className="font-bold truncate" title={cam.name}>{cam.name}</p>
                                
                                <div className="mt-1 pt-1 border-t border-slate-200/60 flex items-center justify-between text-[8px] font-mono">
                                  <span>{!isInstalled ? 'PUERTO LIBRE' : isAct ? 'SEÑAL OK' : 'SIN SEÑAL'}</span>
                                  <span className={`font-bold ${!isInstalled ? 'text-slate-400' : isRec ? 'text-rose-700' : 'text-amber-700'}`}>
                                    {!isInstalled ? '⚪ EN RESERVA' : isRec ? '🔴 GRABANDO' : '⚠️ NO GRABA'}
                                  </span>
                                </div>
                                {isInstalled && cam.storage_location && (
                                  <div className="text-[7.5px] text-slate-500 font-mono truncate mt-0.5" title={cam.storage_location}>
                                    💾 {cam.storage_location}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ==================================================================== */}
                {/* 4. ANEXO FOTOGRÁFICO Y EVIDENCIA VISUAL (CAPTURAS POR DISPOSITIVO)   */}
                {/* ==================================================================== */}
                <div className="space-y-4 page-break-avoid">
                  <div className="flex items-center gap-2 border-b border-slate-300 pb-1">
                    <span className="bg-slate-900 text-white w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold">4</span>
                    <div>
                      <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                        <ImageIcon size={14} className="text-blue-700" />
                        Anexo Fotográfico / Evidencia Visual de Cobertura en Vivo
                      </h2>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-500 italic">
                    Capturas instantáneas obtenidas de cada canal al momento de la emisión del reporte para respaldo visual del estado operativo, campo visual y confirmación de grabación.
                  </p>

                  <div className="space-y-5">
                    {devices.map((dev) => {
                      const installedCams = (dev.cameras || []).filter(c => c.is_installed ?? true);
                      if (installedCams.length === 0) return null;

                      return (
                        <div key={`photo-dev-${dev.id}`} className="space-y-2.5 border border-slate-200 rounded-lg p-3 bg-slate-50/40 report-photo-grid">
                          <div className="flex justify-between items-center border-b border-slate-200 pb-1.5 text-xs">
                            <div className="flex items-center gap-2 font-bold text-slate-900">
                              <CameraIcon size={14} className="text-slate-600" />
                              <span>{dev.name}</span>
                              <span className="font-mono font-normal text-[10px] text-slate-500">({dev.host}:{dev.port} &bull; {dev.brand})</span>
                            </div>
                            <span className="text-[9.5px] font-mono text-slate-600 font-semibold">
                              {installedCams.length} Cámaras en Servicio
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {installedCams.map((cam) => {
                              const snapshotUrl = `${api.defaults.baseURL}/reports/${summary.report_code}/snapshots/${cam.id}`;

                              return (
                                <div 
                                  key={`photo-cam-${cam.id}`}
                                  className="report-photo-card bg-white border border-slate-300 rounded overflow-hidden flex flex-col justify-between shadow-none"
                                >
                                  <div className="aspect-video bg-black relative flex items-center justify-center overflow-hidden">
                                    <img 
                                      src={snapshotUrl}
                                      alt={cam.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
                                      }}
                                    />
                                    <span className="absolute top-1 left-1 bg-black/80 text-white font-mono font-bold text-[8px] px-1.5 py-0.5 rounded shadow">
                                      CH {cam.channel}
                                    </span>
                                    <span className={`absolute top-1 right-1 font-bold text-[7.5px] px-1.5 py-0.5 rounded shadow ${
                                      cam.is_recording ? 'bg-rose-700 text-white' : 'bg-amber-600 text-white'
                                    }`}>
                                      {cam.is_recording ? '🔴 REC' : '⚠️ NO REC'}
                                    </span>
                                  </div>

                                  <div className="p-1.5 bg-slate-50 border-t border-slate-200">
                                    <p className="font-bold text-[9px] text-slate-900 truncate leading-tight" title={cam.name}>
                                      {cam.name}
                                    </p>
                                    <div className="flex justify-between items-center text-[7.5px] font-mono text-slate-500 mt-1">
                                      <span className={cam.snapshot_verified !== false && cam.has_video_signal ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                                        {cam.snapshot_verified !== false && cam.has_video_signal ? '✓ FOTO VERIFICADA' : '⚠️ SIN IMAGEN'}
                                      </span>
                                      <span className={cam.is_recording ? 'text-rose-700 font-bold' : 'text-amber-700 font-semibold'}>
                                        {cam.is_recording ? 'GRABANDO 24/7' : 'SIN GRABACIÓN'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SECCIÓN 5: REGISTRO DE INCIDENTES RELEVANTES */}
                <div className="space-y-3 page-break-avoid">
                  <div className="flex items-center gap-2 border-b border-slate-300 pb-1">
                    <span className="bg-slate-900 text-white w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold">5</span>
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                      Registro Cronológico de Incidentes y Eventos Relevantes
                    </h2>
                  </div>

                  <div className="border border-slate-300 rounded overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 uppercase text-[9px]">
                        <tr>
                          <th className="p-2 border-r border-slate-200 w-36">Fecha y Hora</th>
                          <th className="p-2 border-r border-slate-200 w-36">Categoría</th>
                          <th className="p-2 border-r border-slate-200 text-center w-24">Severidad</th>
                          <th className="p-2">Detalle Técnico / Acción Registrada</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-[9.5px]">
                        {incidents.slice(0, 5).map((inc) => (
                          <tr key={inc.id} className="hover:bg-slate-50">
                            <td className="p-2 border-r border-slate-200 font-mono text-slate-700">
                              {new Date(inc.timestamp).toLocaleString('es-PE')}
                            </td>
                            <td className="p-2 border-r border-slate-200 font-semibold text-slate-900">
                              {inc.event_type}
                            </td>
                            <td className="p-2 border-r border-slate-200 text-center">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase border ${
                                inc.severity === 'error'
                                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                                  : 'bg-amber-50 text-amber-800 border-amber-300'
                              }`}>
                                {inc.severity === 'error' ? 'CRÍTICO' : 'ALERTA'}
                              </span>
                            </td>
                            <td className="p-2 text-slate-700 text-[9px]">
                              {inc.description}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* SECCIÓN 6: HALLAZGOS Y PLAN DE ACCIÓN RECOMENDADO */}
                <div className="space-y-2 page-break-avoid border border-slate-300 bg-slate-50/70 p-3.5 rounded-lg text-xs">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
                    <span className="bg-slate-900 text-white w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold">6</span>
                    <h3 className="font-black text-slate-900 uppercase text-[10.5px] tracking-wide">
                      Hallazgos de Auditoría y Acciones Correctivas (Plan de Acción)
                    </h3>
                  </div>
                  <ul className="list-disc list-inside space-y-1.5 text-[9.5px] text-slate-700 pt-1">
                    <li>
                      <strong>Integridad de Discos Duros (HDD):</strong> {kpis.hdd_healthy_devices} de {kpis.total_devices} grabadores poseen discos en formato normal. Se recomienda auditar periódicamente los sectores SMART para evitar pérdida de grabaciones forenses.
                    </li>
                    <li>
                      <strong>Canales sin Modalidad de Grabación:</strong> Se constataron {kpis.not_recording_cameras} cámaras fuera de modalidad de grabación. Verificar asignación de canales y habilitar grabación continua (24/7) o por evento en el menú de cada DVR.
                    </li>
                    <li>
                      <strong>Sincronización de Reloj NTP/Local:</strong> {kpis.drifted_devices_count > 0 ? `Se detectaron ${kpis.drifted_devices_count} grabadores con desfase horario > 5 min. Utilice el botón de sincronización de hora con el servidor local para calibrar los registros temporales.` : 'Los grabadores se encuentran sincronizados con la hora del servidor.'}
                    </li>
                  </ul>

                  {/* Notas y Observaciones Técnicas Personalizadas */}
                  {summary.notes && (
                    <div className="mt-3 pt-2.5 border-t border-slate-300">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 text-[10px] uppercase">
                        <FileText size={13} className="text-blue-700" />
                        <span>Notas Adicionales y Dictamen de Auditoría:</span>
                      </div>
                      <p className="text-[9.5px] text-slate-700 whitespace-pre-wrap mt-1 bg-white p-2 rounded border border-slate-200 leading-relaxed font-sans">
                        {summary.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* ==================================================================== */}
                {/* 7. SECCIÓN DE FIRMAS DIGITALES Y CONFORMIDAD POR ROL                 */}
                {/* ==================================================================== */}
                <div className="report-signature-block page-break-avoid pt-6 border-t-2 border-slate-900 space-y-4">
                  <div className="text-center">
                    <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider">
                      Validación de Firmas Digitales y Conformidad Técnica
                    </h3>
                    <p className="text-[8.5px] text-slate-500 font-mono">
                      Emisión con sello criptográfico SHA-256 e identificación de usuario por rol en el sistema centralizado
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto pt-2">
                    {/* FIRMA 1: TÉCNICO DE SOPORTE (OPERADOR / AUDITOR CCTV) */}
                    <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/70 flex flex-col justify-between text-center space-y-2 relative">
                      <div className="space-y-1">
                        <span className="text-[8.5px] font-bold text-slate-500 uppercase tracking-wide">
                          TÉCNICO DE SOPORTE / AUDITOR CCTV
                        </span>
                        <div className="font-bold text-slate-900 text-xs">
                          {techSig.signed ? techSig.signed_by : (user && !isAdmin ? (user.full_name || user.username) : 'Técnico de Soporte TI')}
                        </div>
                        <div className="text-[8px] font-mono text-slate-500">
                          {techSig.signed ? `@${techSig.username} (Operador)` : 'Área de Soporte Técnico'}
                        </div>
                      </div>

                      {/* Estado o Sello Digital de Firma del Técnico */}
                      {techSig.signed ? (
                        <div className="border border-emerald-400 bg-emerald-50 text-emerald-950 p-2 rounded font-mono text-[8px] space-y-0.5 text-left">
                          <div className="flex items-center gap-1 font-bold text-emerald-800 text-[8.5px]">
                            <BadgeCheck size={13} className="text-emerald-600 shrink-0" />
                            <span>✓ FIRMADO DIGITALMENTE</span>
                          </div>
                          <div><strong>Firmante:</strong> {techSig.signed_by}</div>
                          <div><strong>Fecha/Hora:</strong> {new Date(techSig.signed_at).toLocaleString('es-PE')}</div>
                          <div className="truncate text-slate-500 font-mono text-[7.5px]"><strong>Sello:</strong> {techSig.hash}</div>
                        </div>
                      ) : (
                        <div className="space-y-2 py-1">
                          <div className="border-b border-slate-400 w-36 mx-auto" />
                          <div className="text-[8px] text-amber-700 font-medium italic">
                            [ Pendiente de Firma Digital ]
                          </div>
                          {/* Botón de Firma en Pantalla (Solo para Operadores/Técnicos) */}
                          <div className="print:hidden no-print pt-1">
                            {!isAdmin ? (
                              <button
                                type="button"
                                onClick={() => signMutation.mutate('technician')}
                                disabled={signMutation.isPending}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-[10px] font-bold transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5 mx-auto"
                              >
                                <FileSignature size={12} />
                                <span>{signingRole === 'technician' ? 'Registrando...' : 'Firmar como Técnico'}</span>
                              </button>
                            ) : (
                              <span className="text-[8px] text-slate-400 italic">Requiere firma de un Técnico / Operador</span>
                            )}
                          </div>
                        </div>
                      )}

                      <p className="text-[7.5px] text-slate-400 uppercase pt-1">
                        Responsable de Monitoreo y Verificación Técnica
                      </p>
                    </div>

                    {/* FIRMA 2: COORDINADOR DEL ÁREA DE TI (ADMIN / V° B°) */}
                    <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/70 flex flex-col justify-between text-center space-y-2 relative">
                      <div className="space-y-1">
                        <span className="text-[8.5px] font-bold text-slate-500 uppercase tracking-wide">
                          COORDINADOR DEL ÁREA DE TI
                        </span>
                        <div className="font-bold text-slate-900 text-xs">
                          {coordSig.signed ? coordSig.signed_by : (user && isAdmin ? (user.full_name || user.username) : 'Coordinador del Área de TI')}
                        </div>
                        <div className="text-[8px] font-mono text-slate-500">
                          {coordSig.signed ? `@${coordSig.username} (Coordinación)` : 'Jefatura / Coordinación TI'}
                        </div>
                      </div>

                      {/* Estado o Sello Digital de Firma del Coordinador */}
                      {coordSig.signed ? (
                        <div className="border border-blue-400 bg-blue-50 text-blue-950 p-2 rounded font-mono text-[8px] space-y-0.5 text-left">
                          <div className="flex items-center gap-1 font-bold text-blue-800 text-[8.5px]">
                            <CheckCheck size={13} className="text-blue-600 shrink-0" />
                            <span>✓ V° B° CONFORMIDAD REGISTRADA</span>
                          </div>
                          <div><strong>Coordinador:</strong> {coordSig.signed_by}</div>
                          <div><strong>Fecha/Hora:</strong> {new Date(coordSig.signed_at).toLocaleString('es-PE')}</div>
                          <div className="truncate text-slate-500 font-mono text-[7.5px]"><strong>Sello:</strong> {coordSig.hash}</div>
                        </div>
                      ) : (
                        <div className="space-y-2 py-1">
                          <div className="border-b border-slate-400 w-36 mx-auto" />
                          <div className="text-[8px] text-amber-700 font-medium italic">
                            [ Pendiente de V° B° por Coordinación TI ]
                          </div>
                          {/* Botón de Firma en Pantalla */}
                          <div className="print:hidden no-print pt-1">
                            {isAdmin ? (
                              <button
                                type="button"
                                onClick={() => signMutation.mutate('coordinator')}
                                disabled={signMutation.isPending}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-[10px] font-bold transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5 mx-auto"
                              >
                                <CheckCheck size={12} />
                                <span>{signingRole === 'coordinator' ? 'Registrando...' : 'Dar V° B° Coordinador'}</span>
                              </button>
                            ) : (
                              <span className="text-[8px] text-slate-400 italic">Requiere inicio de sesión de Coordinador</span>
                            )}
                          </div>
                        </div>
                      )}

                      <p className="text-[7.5px] text-slate-400 uppercase pt-1">
                        Aprobación Final y Veredicto de Infraestructura
                      </p>
                    </div>
                  </div>
                </div>

                {/* Pie de página institucional con correlativo único */}
                <div className="text-[8px] text-slate-400 text-center border-t border-slate-200 pt-2 font-mono flex justify-between">
                  <span>SISTEMA CENTRALIZADO CCTV &bull; DOCUMENTO CONFIDENCIAL</span>
                  <span>REGISTRO FORENSE N° {summary.report_code || 'INF-CCTV-20260817-0001'} &bull; ANEXO FOTOGRÁFICO INCLUIDO</span>
                </div>

              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveReportModal;
