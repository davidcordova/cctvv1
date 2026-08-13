import React from 'react';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  ShieldCheck, 
  Video,
  ChevronRight,
  Server
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const StatCard = ({ icon: Icon, label, value, color, onClick }) => (
  <div 
    onClick={onClick}
    className={`card-zinc flex flex-col gap-4 ${onClick ? 'cursor-pointer hover:bg-zinc-800/40 transition-all' : ''}`}
  >
    <div className="flex justify-between items-start">
      <div className={`p-3 rounded-xl ${color} bg-opacity-10 text-opacity-90`}>
        <Icon size={24} />
      </div>
    </div>
    <div>
      <p className="text-sm text-zinc-500 font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1 tracking-tight">{value}</p>
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

  const activeCameras = cameras.filter(c => c.is_active).length;
  const onlineDevices = devices.filter(d => d.is_online).length;
  const criticalAlerts = reports.filter(r => r.severity === 'error').length;
  const totalEvents = reports.length;

  const recentEvents = reports.slice(0, 5); // Limit to top 5

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-700">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Estado del Sistema</h1>
          <p className="text-zinc-500">Resumen operativo de la infraestructura de videovigilancia.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={CheckCircle} 
          label="Cámaras Activas" 
          value={`${activeCameras}/${cameras.length}`} 
          color="text-emerald-500" 
          onClick={() => navigate('/wall')}
        />
        <StatCard 
          icon={Server} 
          label="Grabadores Online" 
          value={`${onlineDevices}/${devices.length}`} 
          color="text-blue-500" 
          onClick={() => navigate('/devices')}
        />
        <StatCard 
          icon={AlertTriangle} 
          label="Alertas Críticas" 
          value={criticalAlerts} 
          color="text-rose-500" 
          onClick={() => navigate('/reports')}
        />
        <StatCard 
          icon={Activity} 
          label="Eventos Totales" 
          value={totalEvents} 
          color="text-orange-500" 
          onClick={() => navigate('/reports')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center px-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="text-blue-500" size={20} />
              Eventos Recientes
            </h2>
            <button 
              onClick={() => navigate('/reports')}
              className="text-sm text-blue-500 hover:text-blue-400 font-medium flex items-center gap-1 transition-colors"
            >
              Ver todo <ChevronRight size={16} />
            </button>
          </div>
          
          <div className="space-y-3">
            {recentEvents.length === 0 ? (
              <div className="card-zinc py-10 text-center text-zinc-500 italic">
                No hay eventos recientes registrados.
              </div>
            ) : (
              recentEvents.map(event => (
                <div 
                  key={event.id} 
                  onClick={() => navigate('/reports')}
                  className="card-zinc flex items-center justify-between hover:bg-zinc-800/40 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      event.severity === 'error' ? 'bg-rose-500/10 text-rose-500' : 
                      event.severity === 'warning' ? 'bg-orange-500/10 text-orange-500' : 
                      'bg-blue-500/10 text-blue-500'
                    }`}>
                      <Activity size={20} />
                    </div>
                    <div>
                      <p className="font-medium">{event.event_type}</p>
                      <p className="text-xs text-zinc-500 truncate max-w-md">{event.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors font-mono">{timeAgo(event.timestamp)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold px-2">Acciones Rápidas</h2>
          <div className="grid grid-cols-1 gap-3">
            <button 
              onClick={() => navigate('/wall')}
              className="card-zinc text-left hover:bg-zinc-800/50 transition-all group flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Video className="text-zinc-400 group-hover:text-blue-500 transition-colors" size={20} />
                <span className="font-medium">Abrir Muro</span>
              </div>
              <ChevronRight size={16} className="text-zinc-600" />
            </button>
            <button 
              onClick={() => navigate('/users')}
              className="card-zinc text-left hover:bg-zinc-800/50 transition-all group flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="text-zinc-400 group-hover:text-emerald-500 transition-colors" size={20} />
                <span className="font-medium">Auditar Usuarios</span>
              </div>
              <ChevronRight size={16} className="text-zinc-600" />
            </button>
          </div>
          
          <div className="card-zinc bg-gradient-to-br from-blue-600/20 to-transparent border-blue-500/20 p-6 space-y-4">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <ShieldCheck className="text-white" size={24} />
            </div>
            <h3 className="font-bold">Capacidad Operativa</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              El sistema se encuentra monitoreando {cameras.length} cámaras repartidas en {devices.length} grabadores. Todos los servicios están operando correctamente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

