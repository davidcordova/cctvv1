import React, { useState } from 'react';
import { UserPlus, Shield, Mail, Trash2, Edit, CheckCircle2, XCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

const UserMgmt = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  const [formData, setFormData] = useState({
    username: '', password: '', full_name: '', role: 'operator', is_active: true
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users/');
      return response.data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (editingUser) return api.put(`/users/${editingUser.id}`, data);
      return api.post('/users/', data);
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
      setFormData({ username: user.username, password: '', full_name: user.full_name, role: user.role, is_active: user.is_active });
    } else {
      setEditingUser(null);
      setFormData({ username: '', password: '', full_name: '', role: 'operator', is_active: true });
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
          <p className="text-zinc-500">Controla los niveles de acceso y permisos del personal.</p>
        </div>
        
        <button 
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/20 active:scale-95"
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
          <p className="text-zinc-500 text-sm font-medium">Activos</p>
          <h3 className="text-2xl font-bold mt-1 text-emerald-500">{users.filter(u => u.is_active).length}</h3>
        </div>
        <div className="card-zinc bg-zinc-900/50">
          <p className="text-zinc-500 text-sm font-medium">Inactivos</p>
          <h3 className="text-2xl font-bold mt-1 text-rose-500">{users.filter(u => !u.is_active).length}</h3>
        </div>
      </div>

      <div className="card-zinc p-0 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-zinc-900/50 border-b border-zinc-800">
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Usuario</th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Rol</th>
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
                      <p className="text-xs text-zinc-500">@{user.username}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`flex items-center gap-1.5 text-xs font-bold ${
                    user.role === 'admin' ? 'text-amber-500' : 'text-blue-400'
                  }`}>
                    <Shield size={14} />
                    {user.role.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5">
                    {user.is_active ? (
                      <CheckCircle2 size={16} className="text-emerald-500" />
                    ) : (
                      <XCircle size={16} className="text-rose-500" />
                    )}
                    <span className={user.is_active ? 'text-zinc-300' : 'text-zinc-500'}>
                      {user.is_active ? 'Activo' : 'Suspendido'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openModal(user)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"><Edit size={18} /></button>
                    <button onClick={() => handleDelete(user)} className="p-2 hover:bg-rose-500/10 rounded-lg text-zinc-400 hover:text-rose-400 transition-colors"><Trash2 size={18} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-in">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
              <h2 className="text-xl font-bold">{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
              <button onClick={closeModal} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase">Nombre Completo</label>
                <input required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm" value={formData.full_name} onChange={(e) => setFormData({...formData, full_name: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase">Nombre de Usuario (Username)</label>
                <input required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase">{editingUser ? 'Nueva Contraseña (Opcional)' : 'Contraseña'}</label>
                <input type="password" required={!editingUser} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} placeholder={editingUser ? 'Dejar en blanco para mantener la actual' : ''} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Rol</label>
                  <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm" value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})}>
                    <option value="operator">Operador</option>
                    <option value="admin">Administrador</option>
                    <option value="viewer">Visor</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Estado</label>
                  <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm" value={formData.is_active ? '1' : '0'} onChange={(e) => setFormData({...formData, is_active: e.target.value === '1'})}>
                    <option value="1">Activo</option>
                    <option value="0">Suspendido</option>
                  </select>
                </div>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg font-bold">Cancelar</button>
                <button type="submit" disabled={saveMutation.isPending} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold disabled:opacity-50">
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

