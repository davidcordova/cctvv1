import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Download, 
  Filter, 
  Calendar, 
  AlertTriangle, 
  Info, 
  AlertCircle, 
  Search, 
  RefreshCw, 
  FileSpreadsheet,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Edit3,
  Trash2,
  Ban,
  ShieldCheck,
  UserCheck,
  Layers,
  FileCheck2,
  X,
  Check
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import ExecutiveReportModal from '../components/ExecutiveReportModal';

const ReportMgmt = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'events'
  
  // Modal de visualización de informe
  const [isExecutiveModalOpen, setIsExecutiveModalOpen] = useState(false);
  const [activeReportCode, setActiveReportCode] = useState(null);

  // Modales de Acción (Rechazo y Edición de Notas)
  const [rejectingReport, setRejectingReport] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [editingNotesReport, setEditingNotesReport] = useState(null);
  const [customNotes, setCustomNotes] = useState('');

  // Filtros para Informes de Auditoría
  const [auditSearchTerm, setAuditSearchTerm] = useState('');
  const [auditStatusFilter, setAuditStatusFilter] = useState('all'); // 'all', 'approved', 'pending', 'rejected'
  const [auditGroupBy, setAuditGroupBy] = useState('none'); // 'none', 'month', 'status'

  // Filtros para Bitácora de Eventos
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [eventSearchTerm, setEventSearchTerm] = useState('');

  const userRoleStr = String(user?.role?.value || user?.role || '').toLowerCase();
  const isAdmin = userRoleStr === 'admin' || user?.username === 'admin';

  // 1. Query: Listado de Informes de Auditoría con filtros
  const { 
    data: auditData = { reports: [], stats: { total: 0, approved: 0, pending: 0, rejected: 0 } }, 
    isLoading: isAuditLoading, 
    refetch: refetchAudit, 
    isFetching: isAuditFetching 
  } = useQuery({
    queryKey: ['auditReportsList', auditSearchTerm, auditStatusFilter],
    queryFn: async () => {
      const params = {};
      if (auditSearchTerm.trim()) params.search = auditSearchTerm.trim();
      if (auditStatusFilter !== 'all') params.status = auditStatusFilter;
      const res = await api.get('/reports/audit-reports', { params });
      return res.data;
    }
  });

  // 2. Query: Bitácora de Eventos del Sistema
  const { 
    data: eventReports = [], 
    isLoading: isEventsLoading, 
    refetch: refetchEvents, 
    isFetching: isEventsFetching 
  } = useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      const response = await api.get('/reports/');
      return response.data;
    }
  });

  // Mutation: Rechazar Informe (Admin)
  const rejectMutation = useMutation({
    mutationFn: async ({ reportCode, reason }) => {
      const res = await api.post(`/reports/audit-reports/${reportCode}/reject`, { reason });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditReportsList'] });
      queryClient.invalidateQueries({ queryKey: ['auditReportsHistory'] });
      queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
      setRejectingReport(null);
      setRejectionReason('');
    },
    onError: (err) => {
      alert("Error al rechazar informe: " + (err.response?.data?.detail || err.message));
    }
  });

  // Mutation: Editar Notas/Observaciones
  const updateNotesMutation = useMutation({
    mutationFn: async ({ reportCode, notes }) => {
      const res = await api.put(`/reports/audit-reports/${reportCode}`, { notes });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditReportsList'] });
      queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
      setEditingNotesReport(null);
      setCustomNotes('');
    },
    onError: (err) => {
      alert("Error al guardar observaciones: " + (err.response?.data?.detail || err.message));
    }
  });

  // Mutation: Eliminar Informe (Admin)
  const deleteMutation = useMutation({
    mutationFn: async (reportCode) => {
      const res = await api.delete(`/reports/audit-reports/${reportCode}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditReportsList'] });
      queryClient.invalidateQueries({ queryKey: ['auditReportsHistory'] });
      queryClient.invalidateQueries({ queryKey: ['executiveSummary'] });
    },
    onError: (err) => {
      alert("Error al eliminar informe: " + (err.response?.data?.detail || err.message));
    }
  });

  // Filtrado de eventos
  const filteredEventReports = useMemo(() => {
    return eventReports.filter((r) => {
      const matchesSeverity = selectedSeverity === 'all' || r.severity.toLowerCase() === selectedSeverity;
      const term = eventSearchTerm.toLowerCase().trim();
      const matchesSearch = !term || 
        (r.event_type && r.event_type.toLowerCase().includes(term)) ||
        (r.description && r.description.toLowerCase().includes(term));
      return matchesSeverity && matchesSearch;
    });
  }, [eventReports, selectedSeverity, eventSearchTerm]);

  // Agrupación de informes de auditoría
  const groupedAuditReports = useMemo(() => {
    const list = auditData.reports || [];
    if (auditGroupBy === 'month') {
      const groups = {};
      list.forEach((r) => {
        const d = r.created_at ? new Date(r.created_at) : new Date();
        const key = d.toLocaleString('es-PE', { month: 'long', year: 'numeric' }).toUpperCase();
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
      });
      return groups;
    }
    if (auditGroupBy === 'status') {
      const groups = { 'APROBADOS / CONFORMES': [], 'PENDIENTES DE FIRMA': [], 'RECHAZADOS': [] };
      list.forEach((r) => {
        if (r.status === 'approved') groups['APROBADOS / CONFORMES'].push(r);
        else if (r.status === 'rejected') groups['RECHAZADOS'].push(r);
        else groups['PENDIENTES DE FIRMA'].push(r);
      });
      return groups;
    }
    return { 'TODOS LOS INFORMES': list };
  }, [auditData.reports, auditGroupBy]);

  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const handleCreateNewReport = async () => {
    setIsCreatingNew(true);
    try {
      const res = await api.get('/reports/executive-summary', { params: { force_new: true } });
      if (res.data && res.data.report_code) {
        queryClient.invalidateQueries({ queryKey: ['auditReportsList'] });
        queryClient.invalidateQueries({ queryKey: ['auditReportsHistory'] });
        setActiveReportCode(res.data.report_code);
        setIsExecutiveModalOpen(true);
      }
    } catch (err) {
      alert("Error al generar nuevo informe: " + (err.response?.data?.detail || err.message));
    } finally {
      setIsCreatingNew(false);
    }
  };

  const handleOpenReport = (reportCode = null) => {
    setActiveReportCode(reportCode);
    setIsExecutiveModalOpen(true);
  };

  const handleDeleteReport = (reportCode) => {
    if (confirm(`¿Estás seguro de eliminar permanentemente el informe ${reportCode}? Esta acción no se puede deshacer.`)) {
      deleteMutation.mutate(reportCode);
    }
  };

  const exportToCSV = () => {
    if (!filteredEventReports || filteredEventReports.length === 0) {
      alert("No hay reportes que coincidan con los filtros actuales para exportar.");
      return;
    }
    const headers = ["ID", "Fecha y Hora", "Tipo de Evento", "Severidad", "Descripción"];
    const rows = filteredEventReports.map(r => [
      r.id,
      new Date(r.timestamp).toLocaleString('es-PE'),
      `"${(r.event_type || '').replace(/"/g, '""')}"`,
      r.severity,
      `"${(r.description || '').replace(/"/g, '""')}"`
    ]);
    
    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `cctv_eventos_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className={`p-8 space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto ${isExecutiveModalOpen ? 'print:hidden' : ''}`}>
        
        {/* Header Principal */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <FileCheck2 size={22} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white">Centro de Reportes &amp; Auditoría</h1>
              <p className="text-zinc-400 text-sm">Control centralizado de informes ejecutivos, verificación de firmas y bitácora de eventos.</p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => {
              if (activeTab === 'audit') refetchAudit();
              else refetchEvents();
            }}
            className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all cursor-pointer"
            title="Refrescar datos"
          >
            <RefreshCw size={18} className={(isAuditFetching || isEventsFetching) ? "animate-spin text-blue-400" : ""} />
          </button>

          <button 
            type="button"
            onClick={handleCreateNewReport}
            disabled={isCreatingNew}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/25 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Plus size={18} className={isCreatingNew ? 'animate-spin' : ''} />
            <span>{isCreatingNew ? 'Creando Nuevo Borrador...' : 'Generar Nuevo Informe'}</span>
          </button>
        </div>
      </header>

      {/* Selector de Pestañas (Tabs) */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2.5 px-5 py-3 font-bold text-sm rounded-t-xl transition-all cursor-pointer border-b-2 ${
            activeTab === 'audit'
              ? 'border-blue-500 text-blue-400 bg-zinc-900/60'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30'
          }`}
        >
          <FileSpreadsheet size={18} />
          <span>Informes Ejecutivos de Auditoría</span>
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-mono bg-zinc-800 text-zinc-300">
            {auditData.stats?.total || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2.5 px-5 py-3 font-bold text-sm rounded-t-xl transition-all cursor-pointer border-b-2 ${
            activeTab === 'events'
              ? 'border-blue-500 text-blue-400 bg-zinc-900/60'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30'
          }`}
        >
          <FileText size={18} />
          <span>Bitácora de Eventos y Alertas</span>
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-mono bg-zinc-800 text-zinc-300">
            {eventReports.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* PESTAÑA 1: GESTOR DE INFORMES EJECUTIVOS (AUDITORÍA & FIRMAS)             */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          
          {/* Tarjetas de Estadísticas / KPIs de Informes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                <span>Total Emitidos</span>
                <FileCheck2 size={16} className="text-blue-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white mt-1 font-mono">
                {auditData.stats?.total || 0}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Registros oficiales archivados</p>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                <span>Aprobados / Conformes</span>
                <CheckCircle2 size={16} className="text-emerald-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 font-mono">
                {auditData.stats?.approved || 0}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Con V° B° y 2 firmas registradas</p>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-amber-400 text-xs font-semibold uppercase tracking-wider">
                <span>Pendientes de Firma</span>
                <Clock size={16} className="text-amber-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-400 mt-1 font-mono">
                {auditData.stats?.pending || 0}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">En espera de firma o V° B°</p>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-rose-400 text-xs font-semibold uppercase tracking-wider">
                <span>Rechazados</span>
                <Ban size={16} className="text-rose-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black text-rose-400 mt-1 font-mono">
                {auditData.stats?.rejected || 0}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Devueltos por Coordinación TI</p>
            </div>
          </div>

          {/* Barra de Filtros, Búsqueda y Agrupación */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-zinc-900/90 p-4 rounded-2xl border border-zinc-800">
            {/* Buscador */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={auditSearchTerm}
                onChange={(e) => setAuditSearchTerm(e.target.value)}
                placeholder="Buscar por código correlativo, usuario, notas..."
                className="w-full pl-10 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Filtro por Estado */}
              <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800 text-xs">
                <Filter size={14} className="text-zinc-500" />
                <span className="text-zinc-400">Estado:</span>
                <select
                  value={auditStatusFilter}
                  onChange={(e) => setAuditStatusFilter(e.target.value)}
                  className="bg-transparent text-white font-semibold outline-none cursor-pointer"
                >
                  <option value="all" className="bg-zinc-900 text-white">Todos ({auditData.stats?.total || 0})</option>
                  <option value="approved" className="bg-zinc-900 text-emerald-400">Aprobados ({auditData.stats?.approved || 0})</option>
                  <option value="pending" className="bg-zinc-900 text-amber-400">Pendientes ({auditData.stats?.pending || 0})</option>
                  <option value="rejected" className="bg-zinc-900 text-rose-400">Rechazados ({auditData.stats?.rejected || 0})</option>
                </select>
              </div>

              {/* Modo de Agrupación */}
              <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800 text-xs">
                <Layers size={14} className="text-zinc-500" />
                <span className="text-zinc-400">Agrupar:</span>
                <select
                  value={auditGroupBy}
                  onChange={(e) => setAuditGroupBy(e.target.value)}
                  className="bg-transparent text-white font-semibold outline-none cursor-pointer"
                >
                  <option value="none" className="bg-zinc-900 text-white">Sin Agrupar</option>
                  <option value="month" className="bg-zinc-900 text-white">Por Mes / Fecha</option>
                  <option value="status" className="bg-zinc-900 text-white">Por Estado</option>
                </select>
              </div>
            </div>
          </div>

          {/* Listado de Informes Agrupados / Tabla */}
          {isAuditLoading ? (
            <div className="p-16 text-center space-y-3 bg-zinc-900/40 rounded-2xl border border-zinc-800/80">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-zinc-400 text-sm">Cargando catálogo de informes ejecutivos...</p>
            </div>
          ) : Object.keys(groupedAuditReports).length === 0 || (auditData.reports || []).length === 0 ? (
            <div className="p-16 text-center space-y-3 bg-zinc-900/40 rounded-2xl border border-zinc-800/80">
              <FileCheck2 size={40} className="mx-auto text-zinc-600" />
              <h3 className="text-base font-bold text-white">No se encontraron informes</h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                No hay registros que coincidan con los filtros aplicados o aún no se ha generado ningún informe de auditoría.
              </p>
              <button
                type="button"
                onClick={handleCreateNewReport}
                disabled={isCreatingNew}
                className="mt-2 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow cursor-pointer disabled:opacity-50"
              >
                <Plus size={14} className={isCreatingNew ? 'animate-spin' : ''} />
                <span>{isCreatingNew ? 'Creando Nuevo Borrador...' : 'Generar Primer Informe'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedAuditReports).map(([groupTitle, reportList]) => {
                if (!reportList || reportList.length === 0) return null;

                return (
                  <div key={groupTitle} className="space-y-3">
                    {auditGroupBy !== 'none' && (
                      <div className="flex items-center gap-2 pt-2 border-b border-zinc-800 pb-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <h3 className="font-mono font-bold text-xs tracking-wider text-zinc-300 uppercase">
                          {groupTitle} ({reportList.length})
                        </h3>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3">
                      {reportList.map((rep) => {
                        const isApproved = rep.status === 'approved';
                        const isRejected = rep.status === 'rejected';
                        const isPending = !isApproved && !isRejected;

                        return (
                          <div
                            key={rep.id || rep.report_code}
                            className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-900/70 hover:bg-zinc-900 ${
                              isApproved
                                ? 'border-emerald-500/30'
                                : isRejected
                                ? 'border-rose-500/40 bg-rose-950/10'
                                : 'border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            {/* Información del Informe */}
                            <div className="space-y-2 flex-1">
                              <div className="flex flex-wrap items-center gap-2.5">
                                <span className="font-mono font-black text-sm text-blue-400 bg-blue-950/60 border border-blue-700/50 px-2.5 py-0.5 rounded-lg">
                                  {rep.report_code}
                                </span>

                                {/* Badge de Estado */}
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                                  isApproved
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : isRejected
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                  {isApproved && <CheckCircle2 size={12} />}
                                  {isRejected && <XCircle size={12} />}
                                  {isPending && <Clock size={12} />}
                                  <span>{isApproved ? 'Aprobado (Conforme)' : isRejected ? 'Rechazado' : 'Pendiente de Firma'}</span>
                                </span>

                                <span className="text-xs text-zinc-500 font-mono">
                                  {rep.created_at ? new Date(rep.created_at).toLocaleString('es-PE') : 'Fecha N/A'}
                                </span>
                              </div>

                              {/* Métricas Resumen */}
                              <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300">
                                <div>
                                  <span className="text-zinc-500">SLA Operativo: </span>
                                  <strong className="text-white font-mono">{rep.overall_sla}%</strong>
                                </div>
                                <div className="text-zinc-600">&bull;</div>
                                <div>
                                  <span className="text-zinc-500">Grabando: </span>
                                  <strong className="text-rose-400 font-mono">{rep.recording_cameras}/{rep.installed_cameras}</strong>
                                </div>
                                <div className="text-zinc-600">&bull;</div>
                                <div>
                                  <span className="text-zinc-500">Grabadores: </span>
                                  <strong className="text-white font-mono">{rep.devices_count}</strong>
                                </div>
                                <div className="text-zinc-600">&bull;</div>
                                <div>
                                  <span className="text-zinc-500">Emitido por: </span>
                                  <strong className="text-zinc-300">@{rep.generated_by}</strong>
                                </div>
                              </div>

                              {/* Estado de Firmas en Fila */}
                              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono">
                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded border ${
                                  rep.signatures?.technician?.signed
                                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                                    : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                                }`}>
                                  <UserCheck size={12} className={rep.signatures?.technician?.signed ? 'text-emerald-400' : 'text-zinc-600'} />
                                  <span>Técnico: {rep.signatures?.technician?.signed ? rep.signatures.technician.signed_by : 'Sin firmar'}</span>
                                </div>

                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded border ${
                                  rep.signatures?.coordinator?.signed
                                  ? 'bg-blue-950/40 text-blue-300 border-blue-800/60'
                                  : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                                }`}>
                                  <ShieldCheck size={12} className={rep.signatures?.coordinator?.signed ? 'text-blue-400' : 'text-zinc-600'} />
                                  <span>V° B° Coord: {rep.signatures?.coordinator?.signed ? rep.signatures.coordinator.signed_by : 'Sin aprobar'}</span>
                                </div>
                              </div>

                              {/* Motivo de Rechazo (si aplica) */}
                              {isRejected && rep.rejection_reason && (
                                <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-800/50 text-xs text-rose-300 space-y-0.5">
                                  <div className="font-bold flex items-center gap-1.5 text-rose-400">
                                    <AlertCircle size={13} />
                                    <span>Motivo de Rechazo (por @{rep.rejected_by}):</span>
                                  </div>
                                  <p className="text-[11px] text-rose-200 pl-4">{rep.rejection_reason}</p>
                                </div>
                              )}

                              {/* Notas / Observaciones Adicionales (si aplica) */}
                              {rep.notes && (
                                <div className="text-[11.5px] text-zinc-400 italic bg-zinc-950/60 p-2 rounded-lg border border-zinc-800">
                                  <strong>Notas:</strong> {rep.notes}
                                </div>
                              )}
                            </div>

                            {/* Botones de Acción */}
                            <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 md:pt-0">
                              {/* Ver / Imprimir Reporte */}
                              <button
                                type="button"
                                onClick={() => handleOpenReport(rep.report_code)}
                                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow active:scale-95 cursor-pointer"
                                title="Ver informe formal y exportar a PDF"
                              >
                                <Eye size={13} />
                                <span>Ver / PDF</span>
                              </button>

                              {/* Editar Observaciones */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNotesReport(rep);
                                  setCustomNotes(rep.notes || '');
                                }}
                                className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border border-zinc-700 cursor-pointer"
                                title="Editar observaciones y notas de auditoría"
                              >
                                <Edit3 size={13} />
                                <span>Editar</span>
                              </button>

                              {/* Rechazar Informe (Solo Admin) */}
                              {isAdmin && !isRejected && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectingReport(rep);
                                    setRejectionReason('');
                                  }}
                                  className="flex items-center gap-1 bg-rose-950/60 hover:bg-rose-900 text-rose-300 hover:text-rose-100 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border border-rose-800/60 cursor-pointer"
                                  title="Rechazar este informe como Coordinador de TI"
                                >
                                  <Ban size={13} />
                                  <span>Rechazar</span>
                                </button>
                              )}

                              {/* Eliminar Informe (Solo Admin) */}
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteReport(rep.report_code)}
                                  className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-xl transition-all cursor-pointer"
                                  title="Eliminar informe"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 2: BITÁCORA DE EVENTOS Y ALERTAS DEL SISTEMA                     */}
      {/* ========================================================================= */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          {/* Controles de Filtros para Eventos */}
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between bg-zinc-900/90 p-4 rounded-2xl border border-zinc-800">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={eventSearchTerm}
                onChange={(e) => setEventSearchTerm(e.target.value)}
                placeholder="Filtrar eventos por tipo, mensaje o descripción..."
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-zinc-950 px-3 py-2 rounded-xl border border-zinc-800 text-sm">
                <Filter size={16} className="text-zinc-500" />
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  className="bg-transparent text-zinc-300 outline-none cursor-pointer font-medium"
                >
                  <option value="all" className="bg-zinc-900 text-white">Todas las severidades</option>
                  <option value="error" className="bg-zinc-900 text-rose-400">Crítico / Error</option>
                  <option value="warning" className="bg-zinc-900 text-amber-400">Advertencia</option>
                  <option value="info" className="bg-zinc-900 text-blue-400">Informativo</option>
                </select>
              </div>

              <button 
                onClick={exportToCSV}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-xl font-semibold transition-all border border-zinc-700 active:scale-95 cursor-pointer text-sm"
              >
                <Download size={16} />
                Exportar CSV / Excel
              </button>
            </div>
          </div>

          {/* Tabla de Eventos */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 font-medium text-xs uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Fecha y Hora</th>
                    <th className="py-3 px-4">Tipo de Evento</th>
                    <th className="py-3 px-4">Severidad</th>
                    <th className="py-3 px-4">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {isEventsLoading ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-zinc-500">
                        Cargando bitácora de eventos...
                      </td>
                    </tr>
                  ) : filteredEventReports.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-zinc-500">
                        No se encontraron registros de eventos con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredEventReports.map((report) => (
                      <tr key={report.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-xs text-zinc-400 whitespace-nowrap">
                          {new Date(report.timestamp).toLocaleString('es-PE')}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-white">
                          {report.event_type}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            report.severity === 'error'
                              ? 'text-rose-500 bg-rose-500/10 border-rose-500/20'
                              : report.severity === 'warning'
                              ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                              : 'text-blue-500 bg-blue-500/10 border-blue-500/20'
                          }`}>
                            {report.severity === 'error' && <AlertCircle size={12} />}
                            {report.severity === 'warning' && <AlertTriangle size={12} />}
                            {report.severity !== 'error' && report.severity !== 'warning' && <Info size={12} />}
                            <span className="capitalize">{report.severity}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-400">
                          {report.description}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: RECHAZAR INFORME (SOLO ADMIN / COORDINADOR)                      */}
      {/* ========================================================================= */}
      {rejectingReport && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 text-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-base">
                <Ban size={20} />
                <span>Rechazar Informe {rejectingReport.report_code}</span>
              </div>
              <button 
                onClick={() => setRejectingReport(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-zinc-300">
              Como <strong>Coordinador del Área de TI</strong>, indique la justificación técnica o las correcciones requeridas para rechazar formalmente este informe:
            </p>

            <textarea
              rows={4}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ejemplo: Se constató que la cámara del canal 4 de la cochera no figura en grabación y requiere revisión previa al V° B°..."
              className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
            />

            <div className="flex justify-end items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingReport(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!rejectionReason.trim()) {
                    alert("Debe escribir el motivo o justificación técnica del rechazo.");
                    return;
                  }
                  rejectMutation.mutate({
                    reportCode: rejectingReport.report_code,
                    reason: rejectionReason
                  });
                }}
                disabled={rejectMutation.isPending}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Ban size={14} />
                <span>{rejectMutation.isPending ? 'Rechazando...' : 'Confirmar Rechazo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: EDITAR OBSERVACIONES / NOTAS DE AUDITORÍA                        */}
      {/* ========================================================================= */}
      {editingNotesReport && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 text-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-blue-400 font-bold text-base">
                <Edit3 size={20} />
                <span>Editar Observaciones: {editingNotesReport.report_code}</span>
              </div>
              <button 
                onClick={() => setEditingNotesReport(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-zinc-300">
              Redacte las conclusiones, recomendaciones o aclaraciones técnicas que se imprimirán en la Sección 6 del informe:
            </p>

            <textarea
              rows={5}
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="Escriba notas adicionales de auditoría aquí..."
              className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />

            <div className="flex justify-end items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingNotesReport(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  updateNotesMutation.mutate({
                    reportCode: editingNotesReport.report_code,
                    notes: customNotes
                  });
                }}
                disabled={updateNotesMutation.isPending}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>{updateNotesMutation.isPending ? 'Guardando...' : 'Guardar Observaciones'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Visor / Modal del Informe Técnico Formal (Aislado para Impresión Limpia) */}
      <ExecutiveReportModal
        isOpen={isExecutiveModalOpen}
        onClose={() => {
          setIsExecutiveModalOpen(false);
          setActiveReportCode(null);
          refetchAudit();
        }}
        initialReportCode={activeReportCode}
      />
    </>
  );
};

export default ReportMgmt;
