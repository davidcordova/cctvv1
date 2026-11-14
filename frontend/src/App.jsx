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
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CameraWall from './pages/CameraWall';
import DeviceMgmt from './pages/DeviceMgmt';
import UserMgmt from './pages/UserMgmt';
import ReportMgmt from './pages/ReportMgmt';
import SystemMgmt from './pages/SystemMgmt';

const SidebarItem = ({ icon: Icon, label, to, onClick, collapsed = false }) => {
  const location = useLocation();
  const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <Link 
      to={to} 
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`relative flex items-center ${collapsed ? 'justify-center px-2.5 py-3' : 'gap-3 px-3.5 py-2.5'} rounded-xl transition-all group border ${
        isActive
          ? 'bg-blue-600/15 text-blue-400 border-blue-500/30 shadow-sm shadow-blue-950/30'
          : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 border-transparent'
      }`}
    >
      {isActive && !collapsed && (
        <span className="absolute left-0 top-2 bottom-2 w-1 bg-blue-500 rounded-r-full" />
      )}
      <Icon
        size={19}
        className={`shrink-0 transition-transform group-hover:scale-110 ${
          isActive ? 'text-blue-400' : 'text-zinc-400 group-hover:text-blue-400'
        }`}
      />
      {!collapsed && <span className="font-medium text-sm truncate">{label}</span>}
    </Link>
  );
};

const SidebarContent = ({ onItemClick, collapsed = false, onToggleCollapse }) => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isViewer = user?.role === 'viewer';

  return (
    <div className="flex flex-col h-full select-none">
      <div className={`flex items-center ${collapsed ? 'flex-col gap-2 justify-center' : 'justify-between px-1'} mb-5`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0">
            <Monitor size={20} className="text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <span className="text-base font-black tracking-tight text-white block truncate">CCTV Master</span>
              <span className="block text-[10px] text-zinc-500 font-mono truncate">v2.1.1 Enterprise</span>
            </div>
          )}
        </div>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors cursor-pointer shrink-0"
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        )}
      </div>
      
      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden">
        {!isViewer && (
          <SidebarItem icon={LayoutDashboard} label="Dashboard" to="/" onClick={onItemClick} collapsed={collapsed} />
        )}
        <SidebarItem icon={Video} label="Muro de Cámaras" to="/wall" onClick={onItemClick} collapsed={collapsed} />
        {!isViewer && (
          <SidebarItem icon={Settings} label="Dispositivos" to="/devices" onClick={onItemClick} collapsed={collapsed} />
        )}
        {!isViewer && (
          <SidebarItem icon={FileText} label="Reportes & Auditoría" to="/reports" onClick={onItemClick} collapsed={collapsed} />
        )}
        {isAdmin && (
          <SidebarItem icon={Users} label="Usuarios" to="/users" onClick={onItemClick} collapsed={collapsed} />
        )}
      </nav>
      
      <div className="pt-3 border-t border-zinc-800/80 space-y-2.5 shrink-0">
        {isAdmin && (
          <SidebarItem icon={Settings} label="Configuración" to="/system" onClick={onItemClick} collapsed={collapsed} />
        )}
        
        {/* User Profile Card & Logout */}
        {user && (
          collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div
                title={`${user.full_name || user.username} (${user.role})`}
                className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs uppercase"
              >
                {user.username ? user.username.slice(0, 2) : 'AD'}
              </div>
              <button
                onClick={logout}
                title="Cerrar sesión"
                className="p-2 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="p-2.5 bg-zinc-900/90 border border-zinc-800 rounded-xl flex items-center justify-between">
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
          )
        )}
      </div>
    </div>
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

const MainLayout = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem('cctv_sidebar_collapsed') === 'true';
    } catch (e) {
      return false;
    }
  });
  const location = useLocation();
  const isWallRoute = location.pathname === '/wall';

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cctv_sidebar_collapsed', String(next));
      } catch (e) {}
      return next;
    });
  };

  // Cerrar menú móvil al cambiar de ruta
  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex flex-col lg:flex-row w-full min-h-screen lg:h-screen lg:overflow-hidden bg-zinc-950 text-zinc-50">
      {/* Barra superior para móvil/tablet (< 1024px) */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 z-30 sticky top-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shadow-md">
            <Monitor size={16} className="text-white" />
          </div>
          <span className="font-black text-sm text-white tracking-tight">CCTV Master</span>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(prev => !prev)}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          title="Menú de navegación"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Overlay oscuro móvil */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)} 
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200" 
        />
      )}

      {/* Sidebar de escritorio colapsable */}
      <aside className={`hidden lg:flex ${isSidebarCollapsed ? 'w-[72px] px-2.5' : 'w-60 px-3.5'} py-4 h-screen border-r border-zinc-800 bg-zinc-950/90 backdrop-blur-md flex-col shrink-0 select-none transition-all duration-200`}>
        <SidebarContent collapsed={isSidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} />
      </aside>

      {/* Sidebar Drawer para móvil */}
      <aside className={`fixed inset-y-0 left-0 w-72 bg-zinc-900 border-r border-zinc-800 p-4 z-50 lg:hidden flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
        isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-1 rounded-lg text-zinc-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <SidebarContent onItemClick={() => setIsMobileMenuOpen(false)} />
      </aside>

      {/* Contenido principal adaptativo por tipo de vista */}
      <main className={`flex-1 w-full min-w-0 overflow-x-hidden ${
        isWallRoute ? 'lg:overflow-hidden flex flex-col lg:h-full' : 'overflow-y-auto lg:h-full'
      }`}>
        {children}
      </main>
    </div>
  );
};

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
      <ToastProvider>
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
      </ToastProvider>
    </Router>
  );
}

export default App;

