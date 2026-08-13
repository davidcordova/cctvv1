import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Video, 
  Settings, 
  Users, 
  FileText, 
  Monitor, 
  Menu,
  ChevronLeft
} from 'lucide-react';

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

const Sidebar = () => (
  <aside className="w-64 h-screen glass border-r border-zinc-800 flex flex-col p-4">
    <div className="flex items-center gap-3 px-2 mb-8">
      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
        <Monitor size={20} className="text-white" />
      </div>
      <span className="text-xl font-bold tracking-tight">CCTV Master</span>
    </div>
    
    <nav className="flex-1 space-y-1">
      <SidebarItem icon={LayoutDashboard} label="Dashboard" to="/" />
      <SidebarItem icon={Video} label="Muro de Cámaras" to="/wall" />
      <SidebarItem icon={Settings} label="Dispositivos" to="/devices" />
      <SidebarItem icon={FileText} label="Reportes" to="/reports" />
      <SidebarItem icon={Users} label="Usuarios" to="/users" />
    </nav>
    
    <div className="pt-4 border-t border-zinc-800">
      <SidebarItem icon={Settings} label="Configuración" to="/system" />
    </div>
  </aside>
);

function App() {
  return (
    <Router>
      <div className="flex w-full min-h-screen bg-zinc-950 text-zinc-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/wall" element={<CameraWall />} />
            <Route path="/devices" element={<DeviceMgmt />} />
            <Route path="/reports" element={<ReportMgmt />} />
            <Route path="/users" element={<UserMgmt />} />
            <Route path="/system" element={<SystemMgmt />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
