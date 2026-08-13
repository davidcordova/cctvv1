import axios from 'axios';

const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Si se sirve desde el mismo servidor backend (puerto 8500 o producción)
  if (window.location.port === '8500' || import.meta.env.PROD) {
    return '/api/v1';
  }
  const hostname = window.location.hostname || 'localhost';
  return `http://${hostname}:8500/api/v1`;
};


const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor for JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const deviceService = {
  getDevices: () => api.get('/devices/'),
  createDevice: (data) => api.post('/devices/', data),
};

export const authService = {
  login: (username, password) => {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    return api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export default api;
