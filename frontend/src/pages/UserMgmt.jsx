import React, { useState } from 'react';
import { UserPlus, Shield, Mail, Trash2, Edit, CheckCircle2, XCircle, Video, Camera as CameraIcon } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

const UserMgmt = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  const [formData, setFormData] = useState({
    username: '', password: '', full_name: '', role: 'operator', is_active: true, camera_ids: []
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users/');
      return response.data;
    }
  });

  const { data: cameras = [] } = useQuery({
    queryKey: ['cameras'],
    queryFn: async () => {
      const response = await api.get('/cameras/');
      return response.data;
    }
  });

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const response = await api.get('/devices/');
      return response.data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data };
      if (editingUser && !payload.password) {
        delete payload.password;
      }
      if (editingUser) return api.put(`/users/${editingUser.id}`, payload);
      return api.post('/users/', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
    onError: (err) => alert('Error: ' + (err.response?.data?.detail || err.message))
  });

  const openModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({ 
        username: user.username, 
        password: '', 
        full_name: user.full_name, 
        role: user.role, 
        is_active: user.is_active,
        camera_ids: user.camera_ids || []
      });
    } else {
      setEditingUser(null);
      setFormData({ 
        username: '', 
        password: '', 
        full_name: '', 
        role: 'viewer', 
        is_active: true,
        camera_ids: []
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleDelete = (user) => {
    if(confirm(`¿Eliminar al usuario ${user.username}?`)) {
      api.delete(`/users/${user.id}`).then(() => {
        queryClient.invalidateQueries({ queryKey: ['users'] });
      }).catch(err => alert('Error: ' + err.message));
    }
  };

  return (
    <div className="p-8 space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Usuarios</h1>
          <p className="text-zinc-500">Controla los niveles de acceso y permisos de cámaras del personal.</p>
        </div>
        
        <button 
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/20 active:scale-95 cursor-pointer"
        >
          <UserPlus size={20} />
          Nuevo Usuario
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card-zinc bg-zinc-900/50">
          <p className="text-zinc-500 text-sm font-medium">Administradores</p>
          <h3 className="text-2xl font-bold mt-1">{users.filter(u => u.role === 'admin').length}</h3>
        </div>
        <div className="card-zinc bg-zinc-900/50">
          <p className="text-zinc-500 text-sm font-medium">Operadores</p>
          <h3 className="text-2xl font-bold mt-1">{users.filter(u => u.role === 'operator').length}</h3>
        </div>
        <div className="card-zinc bg-zinc-900/50">
          <p className="text-zinc-500 text-sm font-medium">Visualizadores</p>
          <h3 className="text-2xl font-bold mt-1 text-purple-400">{users.filter(u => u.role === 'viewer').length}</h3>
        </div>
        <div className="card-zinc bg-zinc-900/50">
          <p className="text-zinc-500 text-sm font-medium">Activos</p>
          <h3 className="text-2xl font-bold mt-1 text-emerald-500">{users.filter(u => u.is_active).length}</h3>
        </div>
      </div>

      <div className="card-zinc p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-zinc-900/50 border-b border-zinc-800">
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Usuario</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Rol & Permisos</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Estado</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {isLoading ? (
              <tr><td colSpan="4" className="px-6 py-10 text-center text-zinc-500">Cargando usuarios...</td></tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-10 text-center text-zinc-500 italic">
                  No hay usuarios registrados aparte del administrador inicial.
                </td>
              </tr>
            ) : users.map((user) => (
              <tr key={user.id} className="hover:bg-zinc-800/30 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center font-bold text-zinc-300">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-zinc-200">{user.full_name}</p>
                      <p className="text-xs text-zinc-500 font-mono">@{user.username}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="space-y-1">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                      user.role === 'admin' ? 'text-amber-500' : user.role === 'operator' ? 'text-blue-400' : 'text-purple-400'
                    }`}>
                      <Shield size={14} />
                      {user.role === 'viewer' ? 'VISUALIZADOR' : user.role.toUpperCase()}
                    </span>
                    {user.role === 'viewer' && (
                      <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                        <Video size={12} className="text-purple-400" />
                        <span className="bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/20 font-medium">
                          {user.camera_ids?.length || 0} cámara(s) asignada(s)
                        </span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5">
                    {user.is_active ? (
                      <CheckCircle2 size={16} className="text-emerald-500" />
                    ) : (
                      <XCircle size={16} className="text-rose-500" />
                    )}
                    <span className={user.is_active ? 'text-zinc-300 text-sm' : 'text-zinc-500 text-sm'}>
                      {user.is_active ? 'Activo' : 'Suspendido'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openModal(user)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-400 transition-colors cursor-pointer" title="Editar usuario y permisos"><Edit size={18} /></button>
                    <button onClick={() => handleDelete(user)} className="p-2 hover:bg-rose-500/10 rounded-lg text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer" title="Eliminar usuario"><Trash2 size={18} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden scale-in">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <div>
                <h2 className="text-xl font-bold text-zinc-100">{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
                <p className="text-xs text-zinc-500">Configura los datos y permisos de visualización.</p>
              </div>
              <button onClick={closeModal} className="text-zinc-500 hover:text-zinc-300 cursor-pointer">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">Nombre Completo</label>
                <input required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500" value={formData.full_name} onChange={(e) => setFormData({...formData, full_name: e.target.value})} placeholder="Ej. Juan Pérez" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">Nombre de Usuario (Username)</label>
                <input required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} placeholder="Ej. jperez" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase">{editingUser ? 'Nueva Contraseña (Opcional)' : 'Contraseña'}</label>
                <input type="password" required={!editingUser} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} placeholder={editingUser ? 'Dejar en blanco para mantener la actual' : '••••••••'} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Rol</label>
                  <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer" value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})}>
                    <option value="viewer">Visualizador (Solo cámaras asignadas)</option>
                    <option value="operator">Operador (Monitoreo completo)</option>
                    <option value="admin">Administrador (Control total)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Estado</label>
                  <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer" value={formData.is_active ? '1' : '0'} onChange={(e) => setFormData({...formData, is_active: e.target.value === '1'})}>
                    <option value="1">Activo</option>
                    <option value="0">Suspendido</option>
                  </select>
                </div>
              </div>

              {/* Asignación granular de cámaras si el rol es Visualizador (viewer) */}
              {formData.role === 'viewer' && (
                <div className="space-y-2.5 pt-3 border-t border-zinc-800 animate-in fade-in duration-300">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-purple-400 uppercase flex items-center gap-1.5">
                      <Video size={15} />
                      Cámaras Permitidas ({formData.camera_ids?.length || 0} de {cameras.length})
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, camera_ids: cameras.map(c => c.id) })}
                        className="text-[11px] font-bold text-blue-400 hover:text-blue-300 cursor-pointer hover:underline"
                      >
                        Todas
                      </button>
                      <span className="text-zinc-600">|</span>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, camera_ids: [] })}
                        className="text-[11px] font-bold text-zinc-500 hover:text-zinc-400 cursor-pointer hover:underline"
                      >
                        Ninguna
                      </button>
                    </div>
                  </div>

                  <div className="max-h-52 overflow-y-auto bg-zinc-950 border border-zinc-800/80 rounded-xl p-3 space-y-3">
                    {devices.map(dev => {
                      const devCams = cameras.filter(c => c.device_id === dev.id);
                      if (devCams.length === 0) return null;
                      return (
                        <div key={dev.id} className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500 uppercase px-1">
                            <span>{dev.name}</span>
                            <span className="font-mono text-[10px] text-zinc-600">{dev.host}</span>
                          </div>
                          <div className="grid grid-cols-1 gap-1">
                            {devCams.map(cam => {
                              const isChecked = (formData.camera_ids || []).includes(cam.id);
                              return (
                                <label
                                  key={cam.id}
                                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                                    isChecked 
                                      ? 'bg-purple-500/15 text-zinc-100 border border-purple-500/30 font-medium' 
                                      : 'hover:bg-zinc-900 text-zinc-400 border border-transparent'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const nextIds = e.target.checked
                                        ? [...(formData.camera_ids || []), cam.id]
                                        : (formData.camera_ids || []).filter(id => id !== cam.id);
                                      setFormData({ ...formData, camera_ids: nextIds });
                                    }}
                                    className="rounded border-zinc-800 bg-zinc-900 text-purple-600 focus:ring-0"
                                  />
                                  <span className="font-mono text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded font-bold">
                                    C{cam.channel}
                                  </span>
                                  <span className="truncate flex-1">{cam.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {cameras.length === 0 && (
                      <p className="text-xs text-zinc-500 text-center py-3 italic">No hay cámaras registradas en el sistema.</p>
                    )}
                  </div>
                </div>
              )}
              
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold cursor-pointer transition-all">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold disabled:opacity-50 cursor-pointer transition-all shadow-lg shadow-blue-600/20">
                  {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMgmt;

