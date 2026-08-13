import React, { useState } from 'react';
import { Settings, Database, Globe, Cpu, ShieldCheck, Save, RefreshCw, Radio, CheckCircle2, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

const SystemMgmt = () => {
  const queryClient = useQueryClient();
  const [toastMsg, setToastMsg] = useState(null);

  const { data: stats, isLoading, isError, refetch } = useQuery({
    queryKey: ['systemStats'],
    queryFn: async () => {
      const res = await api.get('/system/stats');
      return res.data;
    },
    refetchInterval: 5000 // Actualizar cada 5s
  });

  const restartMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/system/restart-services');
      return res.data;
    },
    onSuccess: (data) => {
      setToastMsg({ type: 'success', text: data.message || 'Servicios reiniciados correctamente.' });
      queryClient.invalidateQueries({ queryKey: ['systemStats'] });
      setTimeout(() => setToastMsg(null), 4000);
    },
    onError: (err) => {
      setToastMsg({ type: 'error', text: 'Error al reiniciar: ' + (err.response?.data?.detail || err.message) });
      setTimeout(() => setToastMsg(null), 4000);
    }
  });

  const handleSave = () => {
    setToastMsg({ type: 'success', text: 'Configuración general guardada en memoria local.' });
    setTimeout(() => setToastMsg(null), 3000);
  };

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto animate-in fade-in duration-500">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configuración del Sistema</h1>
          <p className="text-zinc-500">Monitoreo de recursos en tiempo real, base de datos y servicios WebRTC.</p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all cursor-pointer"
          title="Refrescar métricas"
        >
          <RefreshCw size={18} className={isLoading ? "animate-spin text-blue-400" : ""} />
        </button>
      </header>

      {toastMsg && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 transition-all ${
          toastMsg.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          {toastMsg.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm font-medium">{toastMsg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8">
        {/* General Settings */}
        <section className="card-zinc space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-zinc-800">
            <Globe size={20} className="text-blue-500" />
            <h2 className="text-xl font-bold">Ajustes Generales</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Nombre del Proyecto</label>
              <input 
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-blue-500 transition-all"
                defaultValue={stats?.project_name || "CCTV Management System"}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Idioma del Sistema</label>
              <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-blue-500 transition-all">
                <option value="es">Español (Latinoamérica)</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </section>

        {/* Database Info */}
        <section className="card-zinc space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-zinc-800">
            <Database size={20} className="text-emerald-500" />
            <h2 className="text-xl font-bold">Base de Datos</h2>
          </div>
          
          <div className="flex items-center justify-between p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                <Database size={24} />
              </div>
              <div>
                <p className="font-bold text-zinc-200">{stats?.database?.engine || 'SQLite 3 (SQLModel ORM)'}</p>
                <p className="text-xs text-zinc-500">
                  Archivo: {stats?.database?.path || 'sql_app.db'} &bull; Tamaño: {stats?.database?.size_mb || 0} MB
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-full border border-emerald-500/30">
              {stats?.database?.healthy ? 'Saludable' : 'Verificar'}
            </span>
          </div>
        </section>

        {/* Server Status */}
        <section className="card-zinc space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-zinc-800">
            <Cpu size={20} className="text-amber-500" />
            <h2 className="text-xl font-bold">Estado del Servidor y WebRTC</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col justify-between">
              <span className="text-zinc-500 text-xs font-semibold uppercase">Uptime del Proceso</span>
              <span className="font-mono text-zinc-200 text-lg font-bold mt-1">
                {stats?.uptime_formatted || 'Cargando...'}
              </span>
            </div>
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col justify-between">
              <span className="text-zinc-500 text-xs font-semibold uppercase">Uso de Memoria (RAM)</span>
              <span className="font-mono text-zinc-200 text-lg font-bold mt-1">
                {stats ? `${stats.memory_mb} MB` : 'Calculando...'}
              </span>
            </div>
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col justify-between">
              <span className="text-zinc-500 text-xs font-semibold uppercase">Servicio WebRTC</span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2.5 h-2.5 rounded-full ${stats?.webrtc_active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-amber-500'}`} />
                <span className="text-zinc-200 font-bold text-sm">
                  {stats?.webrtc_active ? 'En Ejecución (go2rtc)' : 'Modo Snapshots HTTP'}
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-4 pt-4">
          <button 
            onClick={() => restartMutation.mutate()}
            disabled={restartMutation.isPending}
            className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-bold transition-all border border-zinc-700 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={20} className={restartMutation.isPending ? "animate-spin" : ""} />
            {restartMutation.isPending ? 'Reiniciando...' : 'Reiniciar Servicios WebRTC'}
          </button>
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-900/40 active:scale-95 cursor-pointer"
          >
            <Save size={20} />
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemMgmt;


