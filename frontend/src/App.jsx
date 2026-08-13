import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Video, 
  Settings, 
  Users, 
  FileText, 
  Monitor, 
  LogOut,
  Shield
} from 'lucide-react';

import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CameraWall from './pages/CameraWall';
import DeviceMgmt from './pages/DeviceMgmt';
import UserMgmt from './pages/UserMgmt';
import ReportMgmt from './pages/ReportMgmt';
import SystemMgmt from './pages/SystemMgmt';

const SidebarItem = ({ icon: Icon, label, to }) => (
  <Link to={to} className="flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/50 rounded-lg transition-all group">
    <Icon size={20} className="group-hover:scale-110 transition-transform" />
    <span className="font-medium">{label}</span>
  </Link>
);

const Sidebar = () => {
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 h-screen glass border-r border-zinc-800 flex flex-col p-4 select-none">
      <div className="flex items-center gap-3 px-2 mb-8">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/30">
          <Monitor size={20} className="text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight">CCTV Master</span>
      </div>
      
      <nav className="flex-1 space-y-1">
        <SidebarItem icon={LayoutDashboard} label="Dashboard" to="/" />
        <SidebarItem icon={Video} label="Muro de Cámaras" to="/wall" />
        <SidebarItem icon={Settings} label="Dispositivos" to="/devices" />
        <SidebarItem icon={FileText} label="Reportes" to="/reports" />
        {user?.role === 'admin' && (
          <SidebarItem icon={Users} label="Usuarios" to="/users" />
        )}
      </nav>
      
      <div className="pt-4 border-t border-zinc-800 space-y-3">
        <SidebarItem icon={Settings} label="Configuración" to="/system" />
        
        {/* User Profile Card & Logout */}
        {user && (
          <div className="p-3 bg-zinc-900/80 border border-zinc-800/80 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs uppercase shrink-0">
                {user.username ? user.username.slice(0, 2) : 'AD'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-zinc-200 truncate">{user.full_name || user.username}</p>
                <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400">
                  {user.role}
                </span>
              </div>
            </div>
            <button
              onClick={logout}
              title="Cerrar sesión"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

const MainLayout = ({ children }) => (
  <div className="flex w-full min-h-screen bg-zinc-950 text-zinc-50">
    <Sidebar />
    <main className="flex-1 overflow-auto">
      {children}
    </main>
  </div>
);

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/*" element={
            <ProtectedRoute>
              <MainLayout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/wall" element={<CameraWall />} />
                  <Route path="/devices" element={<DeviceMgmt />} />
                  <Route path="/reports" element={<ReportMgmt />} />
                  <Route path="/users" element={<UserMgmt />} />
                  <Route path="/system" element={<SystemMgmt />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </MainLayout>
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;

