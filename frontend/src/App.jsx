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
  const isAdmin = user?.role === 'admin';
  const isOperator = user?.role === 'operator';
  const isViewer = user?.role === 'viewer';

  return (
    <aside className="w-64 h-screen glass border-r border-zinc-800 flex flex-col p-4 select-none">
      <div className="flex items-center gap-3 px-2 mb-8">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/30">
          <Monitor size={20} className="text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight">CCTV Master</span>
      </div>
      
      <nav className="flex-1 space-y-1">
        {!isViewer && (
          <SidebarItem icon={LayoutDashboard} label="Dashboard" to="/" />
        )}
        <SidebarItem icon={Video} label="Muro de Cámaras" to="/wall" />
        {!isViewer && (
          <SidebarItem icon={Settings} label="Dispositivos" to="/devices" />
        )}
        {!isViewer && (
          <SidebarItem icon={FileText} label="Reportes" to="/reports" />
        )}
        {isAdmin && (
          <SidebarItem icon={Users} label="Usuarios" to="/users" />
        )}
      </nav>
      
      <div className="pt-4 border-t border-zinc-800 space-y-3">
        {isAdmin && (
          <SidebarItem icon={Settings} label="Configuración" to="/system" />
        )}
        
        {/* User Profile Card & Logout */}
        {user && (
          <div className="p-3 bg-zinc-900/80 border border-zinc-800/80 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs uppercase shrink-0">
                {user.username ? user.username.slice(0, 2) : 'AD'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-zinc-200 truncate">{user.full_name || user.username}</p>
                <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                  user.role === 'admin' ? 'text-blue-400 bg-blue-500/10' :
                  user.role === 'operator' ? 'text-amber-400 bg-amber-500/10' :
                  'text-purple-400 bg-purple-500/10'
                }`}>
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

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
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

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/wall" replace />;
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

function AppRoutes() {
  const { user } = useAuth();
  const isViewer = user?.role === 'viewer';

  return (
    <Routes>
      <Route path="/" element={isViewer ? <Navigate to="/wall" replace /> : <Dashboard />} />
      <Route path="/wall" element={<CameraWall />} />
      <Route path="/devices" element={
        <ProtectedRoute allowedRoles={['admin', 'operator']}>
          <DeviceMgmt />
        </ProtectedRoute>
      } />
      <Route path="/reports" element={
        <ProtectedRoute allowedRoles={['admin', 'operator']}>
          <ReportMgmt />
        </ProtectedRoute>
      } />
      <Route path="/users" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <UserMgmt />
        </ProtectedRoute>
      } />
      <Route path="/system" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <SystemMgmt />
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to={isViewer ? "/wall" : "/"} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/*" element={
            <ProtectedRoute>
              <MainLayout>
                <AppRoutes />
              </MainLayout>
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;

