import React, { useState, useMemo } from 'react';
import { FileText, Download, Filter, Calendar, AlertTriangle, Info, AlertCircle, Search, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import ExecutiveReportModal from '../components/ExecutiveReportModal';

const ReportMgmt = () => {
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExecutiveModalOpen, setIsExecutiveModalOpen] = useState(false);

  const { data: reports = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      const response = await api.get('/reports/');
      return response.data;
    }
  });

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const matchesSeverity = selectedSeverity === 'all' || r.severity.toLowerCase() === selectedSeverity;
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || 
        (r.event_type && r.event_type.toLowerCase().includes(term)) ||
        (r.description && r.description.toLowerCase().includes(term));
      return matchesSeverity && matchesSearch;
    });
  }, [reports, selectedSeverity, searchTerm]);

  const getSeverityStyles = (severity) => {
    switch ((severity || '').toLowerCase()) {
      case 'error': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
      case 'warning': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      default: return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    }
  };

  const getSeverityIcon = (severity) => {
    switch ((severity || '').toLowerCase()) {
      case 'error': return <AlertCircle size={14} />;
      case 'warning': return <AlertTriangle size={14} />;
      default: return <Info size={14} />;
    }
  };

  const exportToCSV = () => {
    if (!filteredReports || filteredReports.length === 0) {
      alert("No hay reportes que coincidan con los filtros actuales para exportar.");
      return;
    }
    const headers = ["ID", "Fecha y Hora", "Tipo de Evento", "Severidad", "Descripción"];
    const rows = filteredReports.map(r => [
      r.id,
      new Date(r.timestamp).toLocaleString('es-PE'),
      `"${(r.event_type || '').replace(/"/g, '""')}"`,
      r.severity,
      `"${(r.description || '').replace(/"/g, '""')}"`
    ]);
    
    // Incluir BOM (\uFEFF) para forzar detección UTF-8 correcta en Excel
    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `cctv_reportes_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reportes de Eventos</h1>
          <p className="text-zinc-500">Historial de detecciones, desconexiones y alertas del sistema.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => refetch()}
            className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all cursor-pointer"
            title="Refrescar reportes"
          >
            <RefreshCw size={18} className={isFetching ? "animate-spin text-blue-400" : ""} />
          </button>

          <button 
            onClick={() => setIsExecutiveModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-blue-600/25 active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet size={18} />
            Reporte Ejecutivo
          </button>

          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-200 px-5 py-2.5 rounded-xl font-semibold transition-all active:scale-95 cursor-pointer"
          >
            <Download size={18} />
            Exportar CSV ({filteredReports.length})
          </button>
        </div>
      </header>

      {/* Executive Report Modal */}
      <ExecutiveReportModal 
        isOpen={isExecutiveModalOpen} 
        onClose={() => setIsExecutiveModalOpen(false)} 
      />


      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => setSelectedSeverity(selectedSeverity === 'error' ? 'all' : 'error')}
          className={`card-zinc border-l-4 border-l-rose-500 cursor-pointer transition-all ${
            selectedSeverity === 'error' ? 'ring-2 ring-rose-500/50 bg-rose-500/5' : 'hover:bg-zinc-800/40'
          }`}
        >
          <div className="flex justify-between items-center">
            <div>
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Alertas Críticas</p>
              <h3 className="text-3xl font-bold mt-1 text-rose-500">{reports.filter(r => r.severity === 'error').length}</h3>
            </div>
            <AlertCircle size={32} className="text-rose-500 opacity-20" />
          </div>
        </div>
        <div 
          onClick={() => setSelectedSeverity(selectedSeverity === 'warning' ? 'all' : 'warning')}
          className={`card-zinc border-l-4 border-l-amber-500 cursor-pointer transition-all ${
            selectedSeverity === 'warning' ? 'ring-2 ring-amber-500/50 bg-amber-500/5' : 'hover:bg-zinc-800/40'
          }`}
        >
          <div className="flex justify-between items-center">
            <div>
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Advertencias</p>
              <h3 className="text-3xl font-bold mt-1 text-amber-500">{reports.filter(r => r.severity === 'warning').length}</h3>
            </div>
            <AlertTriangle size={32} className="text-amber-500 opacity-20" />
          </div>
        </div>
        <div 
          onClick={() => setSelectedSeverity('all')}
          className={`card-zinc border-l-4 border-l-blue-500 cursor-pointer transition-all ${
            selectedSeverity === 'all' ? 'ring-2 ring-blue-500/50 bg-blue-500/5' : 'hover:bg-zinc-800/40'
          }`}
        >
          <div className="flex justify-between items-center">
            <div>
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Eventos Totales</p>
              <h3 className="text-3xl font-bold mt-1 text-blue-500">{reports.length}</h3>
            </div>
            <Info size={32} className="text-blue-500 opacity-20" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 w-full md:w-80">
          <Search size={18} className="text-zinc-500" />
          <input 
            type="text"
            placeholder="Buscar por evento o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-zinc-200 w-full placeholder-zinc-500"
          />
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="text-xs text-zinc-500 uppercase font-semibold">Severidad:</span>
          {['all', 'error', 'warning', 'info'].map((sev) => (
            <button
              key={sev}
              onClick={() => setSelectedSeverity(sev)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                selectedSeverity === sev 
                  ? 'bg-zinc-100 text-zinc-950' 
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {sev === 'all' ? 'Todas' : sev}
            </button>
          ))}
        </div>
      </div>

      {/* Reports Table */}
      <div className="card-zinc p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-zinc-900/50 border-b border-zinc-800">
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Fecha y Hora</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Tipo de Evento</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Severidad</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Descripción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {isLoading ? (
              <tr><td colSpan="4" className="px-6 py-10 text-center text-zinc-500">Cargando reportes...</td></tr>
            ) : filteredReports.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-20 text-center space-y-4">
                   <div className="mx-auto w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-700 border border-zinc-800">
                     <FileText size={32} />
                   </div>
                   <p className="text-zinc-500 italic">No se encontraron eventos con los filtros seleccionados.</p>
                </td>
              </tr>
            ) : filteredReports.map((report) => (
              <tr key={report.id} className="hover:bg-zinc-800/20 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Calendar size={14} className="text-zinc-500" />
                    {new Date(report.timestamp).toLocaleString()}
                  </div>
                </td>
                <td className="px-6 py-4 font-bold text-zinc-200">{report.event_type}</td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5 w-fit ${getSeverityStyles(report.severity)}`}>
                    {getSeverityIcon(report.severity)}
                    {report.severity}
                  </span>
                </td>
                <td className="px-6 py-4 text-zinc-400 text-sm">{report.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportMgmt;

