import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutGrid, 
  Maximize2, 
  Settings, 
  RefreshCw, 
  Grid3X3, 
  Grid2X2, 
  Camera as CameraIcon, 
  Star, 
  Layers, 
  Play, 
  ChevronLeft, 
  ChevronRight,
  Radio,
  Image as ImageIcon,
  AlertCircle,
  Move,
  GripVertical,
  Check,
  RotateCcw,
  ArrowLeftRight,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import WebRTCPlayer from '../components/WebRTCPlayer';

const CameraCard = ({ 
  camera, 
  onZoom, 
  refreshKey, 
  streamMode, 
  isWebRTCAvailable, 
  isPinned, 
  onPin,
  isReordering,
  orderIndex,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver
}) => {
  const [cardLocalKey, setCardLocalKey] = useState(0);
  const [snapshotUrl, setSnapshotUrl] = useState(`${api.defaults.baseURL}/cameras/${camera.id}/snapshot?t=${Date.now()}`);
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [webrtcError, setWebrtcError] = useState(false);
  const [isRefreshingCard, setIsRefreshingCard] = useState(false);

  const [isAudioActive, setIsAudioActive] = useState(camera.audio_enabled || false);

  // Update snapshot when parent triggers a refresh
  useEffect(() => {
    setSnapshotUrl(`${api.defaults.baseURL}/cameras/${camera.id}/snapshot?t=${Date.now()}`);
    setImgLoading(true);
    setImgError(false);
    setWebrtcError(false);
  }, [refreshKey, camera.id]);

  const handleCardRefresh = (e) => {
    if (e) e.stopPropagation();
    setIsRefreshingCard(true);
    setCardLocalKey(prev => prev + 1);
    setSnapshotUrl(`${api.defaults.baseURL}/cameras/${camera.id}/snapshot?t=${Date.now()}`);
    setImgLoading(true);
    setImgError(false);
    setWebrtcError(false);
    setTimeout(() => setIsRefreshingCard(false), 800);
  };

  const useWebRTC = streamMode === 'webrtc' && isWebRTCAvailable && camera.rtsp_url && !webrtcError;

  return (
    <div 
      key={camera.id} 
      draggable={isReordering}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (!isReordering) {
          onZoom(camera, snapshotUrl);
        }
      }}
      className={`relative group bg-zinc-900 rounded-2xl overflow-hidden border transition-all shadow-xl w-full aspect-video flex flex-col select-none ${
        isReordering 
          ? 'cursor-grab active:cursor-grabbing border-blue-500/70 hover:border-blue-400 ring-2 ring-blue-500/20' 
          : 'cursor-pointer border-zinc-800 hover:border-blue-500/60'
      } ${isDragOver ? 'ring-4 ring-blue-500 scale-[1.02] border-blue-400 z-20' : ''}`}
    >
      <div className="w-full h-full relative aspect-video flex items-center justify-center bg-black overflow-hidden">
        {useWebRTC ? (
          <iframe 
            key={`wall-stream-${camera.id}-${refreshKey}-${cardLocalKey}-${isAudioActive ? 'audio' : 'mute'}`}
            src={`http://${window.location.hostname}:1984/stream.html?src=camera_${camera.id}&mode=webrtc,mse,mp4,mjpeg&media=${isAudioActive ? 'video,audio' : 'video'}&muted=${isAudioActive ? '0' : '1'}`} 
            title={camera.name}
            className="absolute inset-0 w-full h-full border-0 pointer-events-none"
            scrolling="no"
            allow="autoplay; fullscreen"
            onError={() => setWebrtcError(true)}
          />
        ) : !imgError ? (
          <>
            {imgLoading && (
              <div className="absolute inset-0 bg-zinc-950/80 flex flex-col items-center justify-center gap-2 z-10 animate-pulse">
                <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-[10px] text-zinc-500 font-mono">Cargando señal...</span>
              </div>
            )}
            <img 
              src={snapshotUrl} 
              alt={camera.name}
              className={`w-full h-full object-cover transition-all duration-300 ${imgLoading ? 'opacity-0' : 'opacity-100 group-hover:scale-105'}`}
              onLoad={() => setImgLoading(false)}
              onError={() => {
                setImgLoading(false);
                setImgError(true);
              }}
            />
          </>
        ) : (
          <div className="text-zinc-600 flex flex-col items-center gap-2 p-4 text-center">
            <div className="w-12 h-12 bg-zinc-900/80 rounded-2xl flex items-center justify-center border border-zinc-800">
              <CameraIcon size={24} className="opacity-40" />
            </div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CANAL SIN SEÑAL / EN ESPERA</span>
            <span className="text-[9px] text-zinc-600 font-mono">CH {camera.channel}</span>
            <button
              type="button"
              onClick={handleCardRefresh}
              className="mt-1 px-3 py-1 bg-zinc-800 hover:bg-blue-600 text-zinc-300 hover:text-white rounded-lg text-xs font-semibold transition-all border border-zinc-700 pointer-events-auto"
            >
              Reintentar
            </button>
          </div>
        )}
        
        {/* Overlay to catch clicks and prevent iframe from eating pointer events */}
        <div className="absolute inset-0 bg-transparent z-10" />
        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors z-10" />

        {/* Indicador de posición en modo Reordenamiento */}
        {isReordering && typeof orderIndex === 'number' && (
          <div className="absolute top-2.5 left-2.5 z-30 bg-blue-600 text-white font-black text-xs px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 border border-blue-400">
            <GripVertical size={13} className="opacity-80" />
            <span>#{orderIndex + 1}</span>
          </div>
        )}

        {/* Botones de desplazamiento rápido en modo Reordenamiento */}
        {isReordering && (
          <div 
            className="absolute inset-x-0 bottom-2.5 flex justify-center items-center gap-2 z-30 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {canMoveLeft && (
              <button
                type="button"
                onClick={onMoveLeft}
                className="bg-black/85 hover:bg-blue-600 text-white p-1.5 rounded-lg text-xs font-bold border border-zinc-700 shadow-xl transition-all hover:scale-110 active:scale-95 flex items-center gap-1"
                title="Mover a la izquierda / posición anterior"
              >
                <ChevronLeft size={14} />
                <span>Mover</span>
              </button>
            )}
            {canMoveRight && (
              <button
                type="button"
                onClick={onMoveRight}
                className="bg-black/85 hover:bg-blue-600 text-white p-1.5 rounded-lg text-xs font-bold border border-zinc-700 shadow-xl transition-all hover:scale-110 active:scale-95 flex items-center gap-1"
                title="Mover a la derecha / posición siguiente"
              >
                <span>Mover</span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        )}

        {/* Pin to Focus button (cuando no está en modo reordenar) */}
        {!isReordering && onPin && (
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onPin(camera.id); }}
            className={`absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-black/75 backdrop-blur-md border border-zinc-700/50 text-white transition-all z-30 hover:scale-110 ${
              isPinned ? 'text-yellow-400 border-yellow-500/50 bg-yellow-500/10' : 'text-zinc-400 hover:text-yellow-300 opacity-0 group-hover:opacity-100'
            }`}
            title={isPinned ? "Desmarcar foco" : "Marcar como foco principal"}
          >
            <Star size={14} fill={isPinned ? "currentColor" : "none"} />
          </button>
        )}

        {/* Camera Name Tag Header */}
        <div className="absolute top-0 left-0 right-0 p-2.5 bg-gradient-to-b from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 transform -translate-y-2 group-hover:translate-y-0 z-20 pointer-events-none">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-white pr-6 truncate drop-shadow-md">{camera.name}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          </div>
        </div>

        {/* Camera Footer */}
        {!isReordering && (
          <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex justify-between items-end opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-20 pointer-events-none">
            <span className="text-[10px] text-zinc-300 font-mono font-bold bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded border border-zinc-700/60">CH {camera.channel}</span>
            <div className="flex gap-1.5 pointer-events-auto items-center">
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAudioActive(prev => !prev);
                }}
                className={`p-1 rounded transition-all hover:scale-110 active:scale-95 ${
                  isAudioActive 
                    ? 'bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/30' 
                    : 'bg-black/60 hover:bg-zinc-700 text-zinc-300 hover:text-white'
                }`}
                title={isAudioActive ? "Silenciar audio" : "Escuchar audio / micrófono"}
              >
                {isAudioActive ? <Volume2 size={13} /> : <VolumeX size={13} />}
              </button>
              <button 
                type="button"
                onClick={handleCardRefresh}
                className="p-1 rounded bg-black/60 hover:bg-blue-600 text-white transition-all hover:scale-110 active:scale-95"
                title="Reconectar señal de esta cámara"
              >
                <RefreshCw size={13} className={isRefreshingCard ? 'animate-spin' : ''} />
              </button>
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onZoom(camera, snapshotUrl); }}
                className="p-1 rounded bg-black/60 hover:bg-blue-600 text-white transition-all hover:scale-110"
                title="Ampliar vista"
              >
                <Maximize2 size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


const CameraWall = () => {
  const { user } = useAuth();
  const orderStorageKey = user?.id ? `cctv_wall_order_u${user.id}` : 'cctv_wall_order_guest';

  const [layout, setLayout] = useState('auto');
  const [customColumns, setCustomColumns] = useState(3);
  const [pinnedCameraId, setPinnedCameraId] = useState(null);
  const [activePatrolIndex, setActivePatrolIndex] = useState(0);
  const [isWallFullscreen, setIsWallFullscreen] = useState(false);
  const [zoomedCamera, setZoomedCamera] = useState(null);
  const [modalStreamKey, setModalStreamKey] = useState(0);
  const [modalMode, setModalMode] = useState('live');
  const [modalAudioEnabled, setModalAudioEnabled] = useState(false);
  const [videoFit, setVideoFit] = useState('contain');
  const [streamMode, setStreamMode] = useState('webrtc');
  const [autoRefreshSec, setAutoRefreshSec] = useState(5);
  const [isWebRTCAvailable, setIsWebRTCAvailable] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // Estados para reordenamiento dinámico por usuario (Drag & Drop)
  const [isReordering, setIsReordering] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [customOrder, setCustomOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(orderStorageKey);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    const checkWebRTC = async () => {
      try {
        const res = await api.get('/cameras/webrtc-status');
        if (res.data && res.data.available) {
          setIsWebRTCAvailable(true);
          setStreamMode('webrtc');
        }
      } catch (e) {
        setIsWebRTCAvailable(false);
      }
    };
    checkWebRTC();
  }, []);

  const { data: cameras = [], isLoading, isRefetching } = useQuery({
    queryKey: ['cameras'],
    queryFn: async () => {
      const camRes = await api.get('/cameras/');
      return camRes.data;
    }
  });

  // Filtrar cámaras activas
  const baseActiveCameras = useMemo(() => {
    return cameras.filter(c => c.is_active);
  }, [cameras]);

  // Ordenar cámaras según el orden personalizado del usuario
  const activeCameras = useMemo(() => {
    if (!customOrder || customOrder.length === 0) {
      return baseActiveCameras;
    }
    const orderMap = new Map();
    customOrder.forEach((id, idx) => orderMap.set(id, idx));

    return [...baseActiveCameras].sort((a, b) => {
      const posA = orderMap.has(a.id) ? orderMap.get(a.id) : 9999 + a.id;
      const posB = orderMap.has(b.id) ? orderMap.get(b.id) : 9999 + b.id;
      return posA - posB;
    });
  }, [baseActiveCameras, customOrder]);

  // Atajos de teclado para navegación y cierre en vista maximizada (Zoom)
  useEffect(() => {
    if (!zoomedCamera) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setZoomedCamera(null);
      } else if (e.key === 'ArrowLeft' && activeCameras.length > 1) {
        const currentIdx = activeCameras.findIndex(c => c.id === zoomedCamera.id);
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : activeCameras.length - 1;
        const prevCam = activeCameras[prevIdx];
        setZoomedCamera({
          ...prevCam,
          url: `${api.defaults.baseURL}/cameras/${prevCam.id}/snapshot?t=${Date.now()}`
        });
        setModalStreamKey(prev => prev + 1);
      } else if (e.key === 'ArrowRight' && activeCameras.length > 1) {
        const currentIdx = activeCameras.findIndex(c => c.id === zoomedCamera.id);
        const nextIdx = currentIdx < activeCameras.length - 1 ? currentIdx + 1 : 0;
        const nextCam = activeCameras[nextIdx];
        setZoomedCamera({
          ...nextCam,
          url: `${api.defaults.baseURL}/cameras/${nextCam.id}/snapshot?t=${Date.now()}`
        });
        setModalStreamKey(prev => prev + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomedCamera, activeCameras]);

  // Guardar nuevo orden personalizado
  const saveOrder = (newOrderedList) => {
    const newOrderIds = newOrderedList.map(c => c.id);
    setCustomOrder(newOrderIds);
    try {
      localStorage.setItem(orderStorageKey, JSON.stringify(newOrderIds));
    } catch (err) {
      console.error("Error guardando orden:", err);
    }
  };

  // Mover cámara a izquierda/derecha
  const handleMoveCamera = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= activeCameras.length) return;

    const newCameras = [...activeCameras];
    const [moved] = newCameras.splice(index, 1);
    newCameras.splice(targetIndex, 0, moved);
    saveOrder(newCameras);
  };

  // Drag & Drop Handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newCameras = [...activeCameras];
    const [moved] = newCameras.splice(draggedIndex, 1);
    newCameras.splice(targetIndex, 0, moved);
    saveOrder(newCameras);

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Restablecer al orden por defecto (DVR y canal ascendente)
  const handleResetOrder = () => {
    if (confirm('¿Deseas restablecer el orden de las cámaras al valor por defecto?')) {
      setCustomOrder([]);
      try {
        localStorage.removeItem(orderStorageKey);
      } catch (e) {}
    }
  };

  // Calculate items per page based on selected layout
  const getPageSize = () => {
    if (layout === 'cols-2') return 4;
    if (layout === 'cols-3') return 9;
    if (layout === 'cols-4') return 16;
    if (layout === 'focus') return 6;
    if (layout === 'custom') return customColumns * 3;
    return 12; // auto
  };

  const pageSize = getPageSize();
  const totalPages = Math.ceil(activeCameras.length / pageSize) || 1;

  // Reset to Page 1 when layout or customColumns changes
  useEffect(() => {
    setCurrentPage(1);
  }, [layout, customColumns]);

  // Ensure currentPage stays within valid bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Keyboard navigation for slideshow controls (ArrowLeft / ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (zoomedCamera || isReordering || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        setCurrentPage(prev => (prev < totalPages ? prev + 1 : 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentPage(prev => (prev > 1 ? prev - 1 : totalPages));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalPages, zoomedCamera, isReordering]);

  // Cycle through cameras in patrol mode (every 7 seconds)
  useEffect(() => {
    if (layout !== 'patrol' || activeCameras.length === 0) return;
    const interval = setInterval(() => {
      setActivePatrolIndex(prev => (prev + 1) % activeCameras.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [layout, activeCameras.length]);

  // Auto-refresh timer for snapshots
  useEffect(() => {
    if (autoRefreshSec <= 0 || streamMode !== 'snapshot') return;
    const interval = setInterval(() => {
      setRefreshKey(Date.now());
    }, autoRefreshSec * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshSec, streamMode]);

  const toggleFullScreen = () => {
    const elem = document.getElementById('camera-wall-container');
    if (!document.fullscreenElement) {
      if (elem?.requestFullscreen) elem.requestFullscreen();
      setIsWallFullscreen(true);
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      setIsWallFullscreen(false);
    }
  };

  const handleZoom = (camera, currentSnapshotUrl) => {
    setZoomedCamera({
      ...camera,
      url: currentSnapshotUrl
    });
    setModalAudioEnabled(camera.audio_enabled || false);
    setModalMode(streamMode === 'webrtc' && isWebRTCAvailable ? 'live' : 'snapshot');
  };

  const handlePinCamera = (id) => {
    setPinnedCameraId(prev => (prev === id ? null : id));
  };

  const triggerManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['cameras'] });
    setRefreshKey(Date.now());
  };

  // Get paginated camera list for current page
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedCameras = activeCameras.slice(startIndex, startIndex + pageSize);

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-hidden">
      {/* Top Controls Toolbar */}
      <header className="p-3 md:px-6 border-b border-zinc-800 bg-zinc-900/50 flex flex-wrap justify-between items-center gap-3 z-30">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white tracking-tight">Muro de Cámaras</h1>
            <span className="text-xs bg-zinc-800 text-zinc-400 font-mono px-2 py-0.5 rounded-full border border-zinc-700">
              {activeCameras.length} Canales
            </span>
          </div>

          {/* Layout Switcher */}
          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 items-center">
            <button
              onClick={() => setLayout('auto')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${layout === 'auto' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
              title="Cuadrícula Automática"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setLayout('cols-2')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${layout === 'cols-2' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
              title="Cuadrícula 2x2 (4 cámaras grandes)"
            >
              <Grid2X2 size={16} />
            </button>
            <button
              onClick={() => setLayout('cols-3')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${layout === 'cols-3' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
              title="Cuadrícula 3x3 (9 cámaras)"
            >
              <Grid3X3 size={16} />
            </button>
            <button
              onClick={() => setLayout('cols-4')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${layout === 'cols-4' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
              title="Cuadrícula 4x4 (16 cámaras)"
            >
              <Layers size={16} />
            </button>
            <button
              onClick={() => setLayout('focus')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${layout === 'focus' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
              title="Vista de Foco: 1 Principal + Cámaras Secundarias"
            >
              <Star size={16} />
            </button>
            <button
              onClick={() => setLayout('patrol')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${layout === 'patrol' ? 'bg-emerald-600 text-white shadow animate-pulse' : 'text-zinc-400 hover:text-white'}`}
              title="Modo Ronda / Patrullaje Secuencial"
            >
              <Play size={16} />
            </button>
          </div>

          {/* Botón de Reordenamiento Interactivo de Cámaras (Drag & Drop) */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsReordering(!isReordering)}
              className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-1.5 border cursor-pointer active:scale-95 ${
                isReordering 
                  ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/30 ring-2 ring-blue-400/40' 
                  : customOrder.length > 0
                  ? 'bg-blue-950/40 text-blue-400 border-blue-800/60 hover:bg-blue-900/50'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white'
              }`}
              title="Personalizar el orden en que se muestran las cámaras"
            >
              {isReordering ? <Check size={14} /> : <Move size={14} />}
              <span>{isReordering ? 'Listo / Guardar' : customOrder.length > 0 ? 'Orden Personalizado' : 'Reordenar Muro'}</span>
            </button>

            {customOrder.length > 0 && !isReordering && (
              <button
                onClick={handleResetOrder}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-colors cursor-pointer"
                title="Restablecer al orden por defecto (por DVR y canal)"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>

          {/* Quick Page Indicator in Toolbar */}
          {totalPages > 1 && layout !== 'patrol' && (
            <div className="flex items-center gap-1 bg-zinc-950 px-2.5 py-1 rounded-xl border border-zinc-800 text-xs">
              <button 
                onClick={() => setCurrentPage(prev => (prev > 1 ? prev - 1 : totalPages))}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-all active:scale-95 cursor-pointer"
                title="Página Anterior (Flecha Izquierda)"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-mono text-zinc-300 font-semibold px-1 select-none">
                Pág <span className="text-blue-400 font-bold">{currentPage}</span> / {totalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(prev => (prev < totalPages ? prev + 1 : 1))}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-all active:scale-95 cursor-pointer"
                title="Página Siguiente (Flecha Derecha)"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Stream Mode Switcher */}
          <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 items-center text-xs font-semibold">
            <button
              onClick={() => setStreamMode('snapshot')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all cursor-pointer ${
                streamMode === 'snapshot' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
              title="Modo Instantáneas: Máxima estabilidad y bajo consumo"
            >
              <ImageIcon size={14} />
              <span>Snapshots</span>
            </button>
            <button
              onClick={() => setStreamMode('webrtc')}
              disabled={!isWebRTCAvailable}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all cursor-pointer ${
                streamMode === 'webrtc' 
                  ? 'bg-emerald-600 text-white shadow' 
                  : isWebRTCAvailable 
                  ? 'text-zinc-400 hover:text-white' 
                  : 'text-zinc-600 cursor-not-allowed opacity-50'
              }`}
              title={isWebRTCAvailable ? "Modo WebRTC: Transmisión fluida a 30 FPS" : "WebRTC no disponible"}
            >
              <Radio size={14} />
              <span>WebRTC en Vivo</span>
            </button>
          </div>

          {/* Auto-refresh interval dropdown */}
          {streamMode === 'snapshot' && (
            <div className="flex items-center gap-1.5 bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800 text-xs">
              <span className="text-zinc-500 font-medium">Refresco:</span>
              <select 
                value={autoRefreshSec}
                onChange={(e) => setAutoRefreshSec(parseInt(e.target.value))}
                className="bg-transparent text-zinc-200 border-none outline-none font-bold cursor-pointer"
              >
                <option value={3} className="bg-zinc-900 text-zinc-200">3s</option>
                <option value={5} className="bg-zinc-900 text-zinc-200">5s</option>
                <option value={10} className="bg-zinc-900 text-zinc-200">10s</option>
                <option value={0} className="bg-zinc-900 text-zinc-200">Off</option>
              </select>
            </div>
          )}

          <button 
            onClick={triggerManualRefresh}
            className={`bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white px-3 py-2 rounded-lg font-medium transition-all text-xs border border-zinc-700 shadow active:scale-95 flex items-center gap-1.5 cursor-pointer ${isRefetching ? 'border-blue-500/50' : ''}`}
            title="Reconectar y actualizar todas las cámaras del muro"
          >
            <RefreshCw size={14} className={isRefetching ? 'animate-spin text-blue-400' : ''} />
            <span className="hidden sm:inline">Reconectar Todo</span>
          </button>
          <button 
            onClick={toggleFullScreen}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-3.5 py-2 rounded-lg font-medium transition-all text-xs border border-zinc-700 shadow active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <Maximize2 size={14} />
            Pantalla Completa
          </button>
        </div>
      </header>

      {/* Banner Informativo cuando está activo el Modo de Reordenamiento */}
      {isReordering && (
        <div className="bg-blue-600/15 border-b border-blue-500/30 px-6 py-2.5 flex justify-between items-center text-xs animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2 text-blue-300">
            <Move size={15} className="text-blue-400 animate-pulse" />
            <span>
              <strong>Modo de Organización Activo:</strong> Arrastra y suelta cualquier cámara para colocarla en la posición que desees o usa las flechas. El orden se guarda automáticamente para tu usuario (<strong>{user?.full_name || user?.username}</strong>).
            </span>
          </div>
          <button
            onClick={() => setIsReordering(false)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1 rounded-lg font-bold shadow transition-all cursor-pointer"
          >
            Finalizar
          </button>
        </div>
      )}

      {/* Fullscreen container containing the grid and exit button */}
      <div 
        id="camera-wall-container" 
        className="flex-1 flex flex-col bg-zinc-950 relative overflow-hidden"
      >
        {isWallFullscreen && (
          <button
            onClick={toggleFullScreen}
            className="absolute top-4 right-4 z-50 bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-red-600/20 transition-all hover:scale-105"
            title="Salir de pantalla completa"
          >
            <Maximize2 size={12} className="rotate-180" />
            Salir Pantalla Completa
          </button>
        )}

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-4 mt-20">
            <RefreshCw className="animate-spin text-blue-500" size={40} />
            <p className="animate-pulse">Cargando cámaras...</p>
          </div>
        ) : activeCameras.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-4 mt-20">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800 shadow-inner">
              <CameraIcon size={32} />
            </div>
            <div className="text-center">
              <p className="font-bold text-zinc-300">No hay cámaras activas para mostrar</p>
              <p className="text-sm max-w-xs mt-1">Habilita los canales deseados desde la gestión de dispositivos.</p>
            </div>
          </div>
        ) : layout === 'patrol' ? (
          /* Patrol Mode - 1 camera cycling in TRUE FULL BLEED Screen */
          <div className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center bg-black">
            {activeCameras[activePatrolIndex] && (
              <div className="w-full h-full relative flex items-center justify-center bg-black">
                {streamMode === 'webrtc' && isWebRTCAvailable && activeCameras[activePatrolIndex].rtsp_url ? (
                  <iframe 
                    key={`patrol-stream-${activeCameras[activePatrolIndex].id}-${refreshKey}`}
                    src={`http://${window.location.hostname}:1984/webrtc.html?src=camera_${activeCameras[activePatrolIndex].id}&mode=webrtc,mse,mp4,mjpeg`} 
                    title={activeCameras[activePatrolIndex].name}
                    className="w-full h-full border-0"
                    allow="autoplay; fullscreen"
                  />
                ) : (
                  <img 
                    src={`${api.defaults.baseURL}/cameras/${activeCameras[activePatrolIndex].id}/snapshot?t=${refreshKey}`}
                    alt={activeCameras[activePatrolIndex].name}
                    className="w-full h-full object-contain"
                  />
                )}

                {/* Floating Top Badge with Camera Name */}
                <div className="absolute top-6 left-6 z-30 bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-zinc-800/80 shadow-2xl flex items-center gap-3 select-none">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                  <div>
                    <h3 className="text-sm font-bold text-white leading-tight">{activeCameras[activePatrolIndex].name}</h3>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      Canal {activeCameras[activePatrolIndex].channel} • {streamMode === 'webrtc' ? 'WebRTC en Vivo (30 FPS)' : 'Snapshot HD'}
                    </p>
                  </div>
                </div>

                {/* Floating Bottom Patrol Controls */}
                <div className="absolute bottom-6 left-6 z-30 bg-black/85 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-zinc-800 text-xs font-semibold text-zinc-200 shadow-2xl flex items-center gap-3.5 select-none">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                    <span className="text-blue-400 font-bold">Ronda Activa ({activePatrolIndex + 1} / {activeCameras.length})</span>
                  </div>
                  <span className="text-zinc-700">|</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePatrolIndex(prev => (prev > 0 ? prev - 1 : activeCameras.length - 1));
                      }}
                      className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                      title="Cámara anterior"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-[11px] text-zinc-400 font-mono">Cambio cada 7s</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePatrolIndex(prev => (prev + 1) % activeCameras.length);
                      }}
                      className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                      title="Siguiente cámara"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : layout === 'focus' ? (
          /* Focus Mode - Professional 3x3 CCTV Surround Grid & 1+N Side Stack */
          (() => {
            const focusCam = activeCameras.find(c => c.id === pinnedCameraId) || activeCameras[0];
            const otherCams = activeCameras.filter(c => c.id !== focusCam.id);
            const totalOthers = otherCams.length;

            if (totalOthers <= 3) {
              return (
                <div 
                  className="flex-1 w-full h-full p-2.5 md:p-3 grid gap-3 overflow-hidden relative select-none"
                  style={{
                    gridTemplateColumns: totalOthers === 0 
                      ? '1fr' 
                      : 'minmax(0, 1fr) minmax(260px, 28vw)'
                  }}
                >
                  {/* Main Large Focus Camera */}
                  <div className="w-full h-full min-h-0 flex flex-col justify-center items-center overflow-hidden">
                    <div className="w-full h-full max-h-full aspect-video flex items-center justify-center">
                      <CameraCard 
                        camera={focusCam} 
                        onZoom={handleZoom} 
                        refreshKey={refreshKey} 
                        streamMode={streamMode}
                        isWebRTCAvailable={isWebRTCAvailable} 
                        isPinned={true}
                        onPin={handlePinCamera}
                      />
                    </div>
                  </div>

                  {/* Secondary Cameras (1 to 3 stacked filling full height) */}
                  {totalOthers > 0 && (
                    <div className="w-full h-full min-h-0 flex flex-col gap-2.5 justify-between overflow-hidden">
                      {otherCams.map((cam, idx) => (
                        <div key={cam.id} className="w-full flex-1 min-h-0 flex items-center justify-center">
                          <CameraCard 
                            camera={cam} 
                            onZoom={handleZoom} 
                            refreshKey={refreshKey} 
                            streamMode={streamMode}
                            isWebRTCAvailable={isWebRTCAvailable} 
                            isPinned={cam.id === pinnedCameraId}
                            onPin={handlePinCamera}
                            isReordering={isReordering}
                            orderIndex={idx + 1}
                            onMoveLeft={() => handleMoveCamera(idx + 1, -1)}
                            onMoveRight={() => handleMoveCamera(idx + 1, 1)}
                            canMoveLeft={idx + 1 > 0}
                            canMoveRight={idx + 1 < activeCameras.length - 1}
                            onDragStart={(e) => handleDragStart(e, idx + 1)}
                            onDragOver={(e) => handleDragOver(e, idx + 1)}
                            onDrop={(e) => handleDrop(e, idx + 1)}
                            onDragEnd={handleDragEnd}
                            isDragOver={dragOverIndex === idx + 1}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            } else {
              const pageSize = 5;
              const focusTotalPages = Math.ceil(totalOthers / pageSize) || 1;
              const focusStartIndex = (currentPage - 1) * pageSize;
              const pageOthers = otherCams.slice(focusStartIndex, focusStartIndex + pageSize);

              const slotClasses = [
                'col-start-3 row-start-1',
                'col-start-3 row-start-2',
                'col-start-1 row-start-3',
                'col-start-2 row-start-3',
                'col-start-3 row-start-3',
              ];

              return (
                <div className="flex-1 w-full h-full p-2.5 md:p-3 relative overflow-hidden flex flex-col justify-between select-none">
                  <div className="flex-1 w-full h-full grid grid-cols-3 grid-rows-3 gap-2.5 min-h-0">
                    {/* Slot 0: Big Main Camera (Takes 2x2 Top-Left) */}
                    <div className="col-span-2 row-span-2 w-full h-full min-h-0 flex items-center justify-center">
                      <CameraCard 
                        camera={focusCam} 
                        onZoom={handleZoom} 
                        refreshKey={refreshKey} 
                        streamMode={streamMode}
                        isWebRTCAvailable={isWebRTCAvailable} 
                        isPinned={true}
                        onPin={handlePinCamera}
                      />
                    </div>

                    {/* Surrounding 5 secondary cameras */}
                    {pageOthers.map((cam, idx) => {
                      const actualIdx = focusStartIndex + idx + 1;
                      return (
                        <div 
                          key={cam.id} 
                          className={`${slotClasses[idx] || ''} w-full h-full min-h-0 flex items-center justify-center animate-in fade-in zoom-in-95 duration-200`}
                        >
                          <CameraCard 
                            camera={cam} 
                            onZoom={handleZoom} 
                            refreshKey={refreshKey} 
                            streamMode={streamMode}
                            isWebRTCAvailable={isWebRTCAvailable} 
                            isPinned={cam.id === pinnedCameraId}
                            onPin={handlePinCamera}
                            isReordering={isReordering}
                            orderIndex={actualIdx}
                            onMoveLeft={() => handleMoveCamera(actualIdx, -1)}
                            onMoveRight={() => handleMoveCamera(actualIdx, 1)}
                            canMoveLeft={actualIdx > 0}
                            canMoveRight={actualIdx < activeCameras.length - 1}
                            onDragStart={(e) => handleDragStart(e, actualIdx)}
                            onDragOver={(e) => handleDragOver(e, actualIdx)}
                            onDrop={(e) => handleDrop(e, actualIdx)}
                            onDragEnd={handleDragEnd}
                            isDragOver={dragOverIndex === actualIdx}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Floating Pagination Pill if total secondary cameras > 5 */}
                  {focusTotalPages > 1 && (
                    <div className="absolute bottom-5 right-5 z-30 bg-zinc-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-zinc-800 text-xs shadow-2xl flex items-center gap-2.5">
                      <button 
                        onClick={() => setCurrentPage(prev => (prev > 1 ? prev - 1 : focusTotalPages))}
                        className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-full transition-colors cursor-pointer"
                        title="Página anterior de cámaras secundarias"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="font-mono text-zinc-300 text-xs font-bold">
                        Secundarias {currentPage} / {focusTotalPages}
                      </span>
                      <button 
                        onClick={() => setCurrentPage(prev => (prev < focusTotalPages ? prev + 1 : 1))}
                        className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-full transition-colors cursor-pointer"
                        title="Página siguiente de cámaras secundarias"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              );
            }
          })()
        ) : (
          /* Standard 16:9 Grid Layouts (Auto, 2x2, 3x3, 4x4, Custom) with Drag & Drop */
          <main className="flex-1 p-4 md:p-6 overflow-y-auto bg-zinc-950 flex flex-col justify-between relative">
            <div 
              key={currentPage}
              className={`grid gap-4 w-full animate-in fade-in zoom-in-95 duration-300 ${
                layout === 'cols-2' ? 'grid-cols-1 sm:grid-cols-2' :
                layout === 'cols-3' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
                layout === 'cols-4' ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4' :
                layout === 'auto' ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4' :
                'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              }`}
              style={layout === 'custom' ? { gridTemplateColumns: `repeat(${customColumns}, minmax(0, 1fr))` } : {}}
            >
              {paginatedCameras.map((camera, idx) => {
                const globalIndex = startIndex + idx;
                return (
                  <div key={camera.id} className="w-full aspect-video">
                    <CameraCard 
                      camera={camera} 
                      onZoom={handleZoom} 
                      refreshKey={refreshKey} 
                      streamMode={streamMode}
                      isWebRTCAvailable={isWebRTCAvailable} 
                      isPinned={camera.id === pinnedCameraId}
                      onPin={handlePinCamera}
                      isReordering={isReordering}
                      orderIndex={globalIndex}
                      onMoveLeft={() => handleMoveCamera(globalIndex, -1)}
                      onMoveRight={() => handleMoveCamera(globalIndex, 1)}
                      canMoveLeft={globalIndex > 0}
                      canMoveRight={globalIndex < activeCameras.length - 1}
                      onDragStart={(e) => handleDragStart(e, globalIndex)}
                      onDragOver={(e) => handleDragOver(e, globalIndex)}
                      onDrop={(e) => handleDrop(e, globalIndex)}
                      onDragEnd={handleDragEnd}
                      isDragOver={dragOverIndex === globalIndex}
                    />
                  </div>
                );
              })}
            </div>
          </main>
        )}

        {/* Floating Slide Navigation Overlay (Presentación Diapositivas) */}
        {totalPages > 1 && layout !== 'patrol' && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300">
            <button 
              onClick={() => setCurrentPage(prev => (prev > 1 ? prev - 1 : totalPages))}
              className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-300 hover:text-white transition-all active:scale-90"
              title="Anterior (Flecha Izquierda)"
            >
              <ChevronLeft size={18} />
            </button>

            {/* Page Dots / Numbers */}
            <div className="flex items-center gap-1.5 px-2">
              {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-7 h-7 rounded-full text-xs font-bold font-mono transition-all ${
                    currentPage === page 
                      ? 'bg-blue-600 text-white scale-110 shadow-lg shadow-blue-600/30' 
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>

            <button 
              onClick={() => setCurrentPage(prev => (prev < totalPages ? prev + 1 : 1))}
              className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-300 hover:text-white transition-all active:scale-90"
              title="Siguiente (Flecha Derecha)"
            >
              <ChevronRight size={18} />
            </button>

            <div className="h-4 w-[1px] bg-zinc-800 mx-0.5" />
            <span className="text-[10px] text-zinc-400 font-medium select-none hidden sm:inline">
              Usa las flechas <kbd className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300 border border-zinc-700">◄</kbd> <kbd className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300 border border-zinc-700">►</kbd> para cambiar
            </span>
          </div>
        )}

        {/* Camera Zoom Modal - Maximizado Completo */}
        {zoomedCamera && (
          <div 
            className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex flex-col animate-in fade-in duration-200"
            onClick={() => setZoomedCamera(null)}
          >
            {/* Header Toolbar */}
            <div className="h-14 px-4 md:px-6 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/90 backdrop-blur-lg shrink-0">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                    {zoomedCamera.name}
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse" />
                  </h2>
                  <p className="text-xs text-zinc-400 font-mono">
                    Canal {zoomedCamera.channel} • {modalMode === 'live' ? 'Transmisión en Vivo (Baja Latencia)' : 'Modo Instantánea HD'}
                  </p>
                </div>
              </div>

              {/* Modal Toolbar Actions */}
              <div className="flex items-center gap-2 sm:gap-3" onClick={(e) => e.stopPropagation()}>
                {/* Switch Live / Snapshot */}
                {isWebRTCAvailable && zoomedCamera.rtsp_url && (
                  <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800 items-center">
                    <button
                      type="button"
                      onClick={() => setModalMode('live')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        modalMode === 'live'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Radio size={13} className={modalMode === 'live' ? 'animate-pulse' : ''} />
                      En Vivo
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalMode('snapshot')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        modalMode === 'snapshot'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <ImageIcon size={13} />
                      Foto HD
                    </button>
                  </div>
                )}

                {/* Reload Stream Button */}
                <button
                  type="button"
                  onClick={() => {
                    setModalStreamKey(prev => prev + 1);
                    setZoomedCamera(prev => prev ? {
                      ...prev,
                      url: `${api.defaults.baseURL}/cameras/${prev.id}/snapshot?t=${Date.now()}`
                    } : null);
                  }}
                  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all text-xs font-medium flex items-center gap-1.5 active:scale-95 border border-zinc-700/50 cursor-pointer"
                  title="Reconectar / Refrescar transmisión"
                >
                  <RefreshCw size={14} />
                  <span className="hidden sm:inline">Refrescar</span>
                </button>

                {/* Botón Audio / Micrófono en Zoom Modal */}
                <button 
                  type="button"
                  onClick={() => setModalAudioEnabled(prev => !prev)}
                  className={`p-2 rounded-lg transition-all text-xs font-medium flex items-center gap-1.5 active:scale-95 border cursor-pointer ${
                    modalAudioEnabled 
                      ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-400 font-bold shadow-lg shadow-amber-500/20' 
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border-zinc-700/50'
                  }`}
                  title={modalAudioEnabled ? "Silenciar audio" : "Escuchar audio / micrófono de la cámara"}
                >
                  {modalAudioEnabled ? <Volume2 size={14} className="animate-pulse" /> : <VolumeX size={14} />}
                  <span className="hidden sm:inline">{modalAudioEnabled ? 'Audio Activo' : 'Silenciado'}</span>
                </button>

                {/* Botón Ajuste de Pantalla (Proporcional vs Llenar) */}
                <button
                  type="button"
                  onClick={() => setVideoFit(prev => prev === 'contain' ? 'cover' : 'contain')}
                  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all text-xs font-medium flex items-center gap-1.5 active:scale-95 border border-zinc-700/50 cursor-pointer"
                  title={videoFit === 'contain' ? 'Llenar pantalla completa' : 'Mantener proporción 16:9'}
                >
                  <Maximize2 size={14} className={videoFit === 'cover' ? 'text-blue-400' : ''} />
                  <span className="hidden sm:inline">{videoFit === 'contain' ? 'Ajustar' : 'Llenar'}</span>
                </button>

                {/* Botón Pantalla Completa Nativa */}
                <button
                  type="button"
                  onClick={() => {
                    if (!document.fullscreenElement) {
                      document.documentElement.requestFullscreen().catch(() => {});
                    } else {
                      document.exitFullscreen().catch(() => {});
                    }
                  }}
                  className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all text-xs font-medium flex items-center gap-1.5 active:scale-95 border border-zinc-700/50 cursor-pointer"
                  title="Pantalla Completa F11"
                >
                  <Move size={14} />
                </button>

                <button 
                  onClick={() => setZoomedCamera(null)}
                  className="bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white px-3.5 py-1.5 rounded-lg font-medium transition-all text-xs active:scale-95 border border-zinc-700/50 cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* Video Player Container Maximizado al 100% */}
            <div className="flex-1 w-full h-[calc(100vh-3.5rem)] flex items-center justify-center p-0 md:p-2 bg-black relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Botón Cámara Anterior */}
              {activeCameras.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const currentIdx = activeCameras.findIndex(c => c.id === zoomedCamera.id);
                    const prevIdx = currentIdx > 0 ? currentIdx - 1 : activeCameras.length - 1;
                    const prevCam = activeCameras[prevIdx];
                    setZoomedCamera({
                      ...prevCam,
                      url: `${api.defaults.baseURL}/cameras/${prevCam.id}/snapshot?t=${Date.now()}`
                    });
                    setModalAudioEnabled(prevCam.audio_enabled || false);
                    setModalStreamKey(prev => prev + 1);
                  }}
                  className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-30 p-2.5 md:p-3 rounded-full bg-zinc-900/80 hover:bg-blue-600 text-zinc-300 hover:text-white backdrop-blur-md border border-zinc-700/50 shadow-2xl transition-all active:scale-90 cursor-pointer"
                  title="Cámara Anterior (Flecha Izquierda)"
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              {/* Video Player Box que ocupa todo el alto/ancho disponible sin barras del navegador */}
              <div className="w-full h-full max-w-full max-h-full flex items-center justify-center relative bg-black">
                {isWebRTCAvailable && zoomedCamera.rtsp_url && modalMode === 'live' ? (
                  <iframe 
                    key={`modal-stream-${zoomedCamera.id}-${modalStreamKey}-${modalAudioEnabled ? 'audio' : 'mute'}`}
                    src={`http://${window.location.hostname}:1984/stream.html?src=camera_${zoomedCamera.id}_hd&mode=webrtc,mse,mp4,mjpeg&media=${modalAudioEnabled ? 'video,audio' : 'video'}&muted=${modalAudioEnabled ? '0' : '1'}`} 
                    title={zoomedCamera.name}
                    className="w-full h-full max-h-full max-w-full border-0 z-10"
                    scrolling="no"
                    allow="autoplay; fullscreen"
                  />
                ) : (
                  <img 
                    src={zoomedCamera.url || `${api.defaults.baseURL}/cameras/${zoomedCamera.id}/snapshot?t=${Date.now()}`} 
                    alt={zoomedCamera.name} 
                    className={`w-full h-full max-h-full max-w-full ${videoFit === 'cover' ? 'object-cover' : 'object-contain'}`}
                  />
                )}
              </div>

              {/* Botón Cámara Siguiente */}
              {activeCameras.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const currentIdx = activeCameras.findIndex(c => c.id === zoomedCamera.id);
                    const nextIdx = currentIdx < activeCameras.length - 1 ? currentIdx + 1 : 0;
                    const nextCam = activeCameras[nextIdx];
                    setZoomedCamera({
                      ...nextCam,
                      url: `${api.defaults.baseURL}/cameras/${nextCam.id}/snapshot?t=${Date.now()}`
                    });
                    setModalAudioEnabled(nextCam.audio_enabled || false);
                    setModalStreamKey(prev => prev + 1);
                  }}
                  className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-30 p-2.5 md:p-3 rounded-full bg-zinc-900/80 hover:bg-blue-600 text-zinc-300 hover:text-white backdrop-blur-md border border-zinc-700/50 shadow-2xl transition-all active:scale-90 cursor-pointer"
                  title="Cámara Siguiente (Flecha Derecha)"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraWall;
