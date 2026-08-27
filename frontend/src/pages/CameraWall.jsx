import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Pause,
  Clock,
  Zap,
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
  VolumeX,
  Mic,
  MicOff,
  Copy,
  ShieldAlert,
  Info
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

  const [isAudioActive, setIsAudioActive] = useState(false);

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
            src={`/player.html?src=camera_${camera.id}&muted=${isAudioActive ? '0' : '1'}`} 
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


const INTERVAL_OPTIONS = [7, 10, 20, 30, 60, 120];

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
  const [modalQuality, setModalQuality] = useState('sd'); // 'sd' (substream ligero) o 'hd' (mainstream alta definición)
  const [modalAudioEnabled, setModalAudioEnabled] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [videoFit, setVideoFit] = useState('contain');
  const [streamMode, setStreamMode] = useState('webrtc');
  const [isWebRTCAvailable, setIsWebRTCAvailable] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // Referencias y estados para el micrófono e intercomunicador bidireccional
  const modalIframeRef = useRef(null);
  const audioMeterRef = useRef(null);
  const [audioVolume, setAudioVolume] = useState(0);
  const [micHelpModal, setMicHelpModal] = useState(false);
  const [micErrorMsg, setMicErrorMsg] = useState('');

  const startAudioMeter = (stream) => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 512;
      microphone.connect(analyser);
      analyser.connect(javascriptNode);
      javascriptNode.connect(audioContext.destination);
      javascriptNode.onaudioprocess = () => {
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        let values = 0;
        for (let i = 0; i < array.length; i++) {
          values += array[i];
        }
        const average = values / array.length;
        setAudioVolume(Math.min(100, Math.round(average * 3.5)));
      };
      audioMeterRef.current = { audioContext, javascriptNode, stream };
    } catch (e) {
      console.warn('Audio meter error:', e);
    }
  };

  const stopAudioMeter = () => {
    if (audioMeterRef.current) {
      try {
        audioMeterRef.current.javascriptNode?.disconnect();
        audioMeterRef.current.audioContext?.close();
        audioMeterRef.current.stream?.getTracks().forEach(t => t.stop());
      } catch (e) {}
      audioMeterRef.current = null;
    }
    setAudioVolume(0);
  };

  const handleStartTalk = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isHttp = window.location.protocol === 'http:';
      const isNotLocal = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      if (isHttp && isNotLocal) {
        setMicErrorMsg('El navegador restringe el uso del micrófono en conexiones HTTP sobre red local.');
        setMicHelpModal(true);
        return;
      }
      alert('Tu navegador no admite acceso al micrófono en este contexto.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      setIsTalking(true);
      setModalAudioEnabled(true);
      startAudioMeter(stream);
      if (modalIframeRef.current && modalIframeRef.current.contentWindow) {
        modalIframeRef.current.contentWindow.postMessage({ type: 'start_talk' }, '*');
      }
    } catch (err) {
      console.error('Error al solicitar micrófono:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicErrorMsg('Permiso de micrófono denegado por el navegador.');
        setMicHelpModal(true);
      } else {
        alert(`No se pudo activar el micrófono: ${err.message || err.name}`);
      }
    }
  };

  const handleStopTalk = () => {
    setIsTalking(false);
    stopAudioMeter();
    if (modalIframeRef.current && modalIframeRef.current.contentWindow) {
      modalIframeRef.current.contentWindow.postMessage({ type: 'stop_talk' }, '*');
    }
  };

  // Intervalos configurables (7, 10, 20, 30, 60, 120s) persistidos en localStorage
  const [autoRefreshSec, setAutoRefreshSec] = useState(() => {
    try {
      const saved = localStorage.getItem('cctv_snapshot_interval');
      return saved !== null ? parseInt(saved, 10) : 10;
    } catch (e) {
      return 10;
    }
  });

  const [patrolIntervalSec, setPatrolIntervalSec] = useState(() => {
    try {
      const saved = localStorage.getItem('cctv_patrol_interval');
      return saved !== null ? parseInt(saved, 10) : 10;
    } catch (e) {
      return 10;
    }
  });

  const [isPatrolPaused, setIsPatrolPaused] = useState(false);
  const [patrolCountdown, setPatrolCountdown] = useState(patrolIntervalSec);

  const handleAutoRefreshChange = (newSec) => {
    const val = parseInt(newSec, 10);
    setAutoRefreshSec(val);
    try {
      localStorage.setItem('cctv_snapshot_interval', String(val));
    } catch (e) {}
  };

  const handlePatrolIntervalChange = (newSec) => {
    const val = parseInt(newSec, 10);
    setPatrolIntervalSec(val);
    setPatrolCountdown(val);
    try {
      localStorage.setItem('cctv_patrol_interval', String(val));
    } catch (e) {}
  };

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
        if (res.data) {
          setIsWebRTCAvailable(Boolean(res.data.available));
        }
      } catch (e) {
        // En caso de fallo transitorio, mantener activo para reintentar
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

  // Sincronizar cuenta regresiva al cambiar intervalo o cámara
  useEffect(() => {
    if (layout !== 'patrol' || activeCameras.length === 0) return;
    setPatrolCountdown(patrolIntervalSec);
  }, [layout, activePatrolIndex, patrolIntervalSec]);

  // Rotar cámaras en modo ronda con temporizador dinámico de 1s y soporte de pausa
  useEffect(() => {
    if (layout !== 'patrol' || activeCameras.length === 0 || isPatrolPaused) return;
    
    const interval = setInterval(() => {
      setPatrolCountdown(prev => {
        if (prev <= 1) {
          setActivePatrolIndex(curr => (curr + 1) % activeCameras.length);
          return patrolIntervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [layout, activeCameras.length, isPatrolPaused, patrolIntervalSec]);

  // Temporizador de auto-refresco para instantáneas (snapshots)
  useEffect(() => {
    if (autoRefreshSec <= 0 || streamMode !== 'snapshot') return;
    const interval = setInterval(() => {
      setRefreshKey(Date.now());
    }, autoRefreshSec * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshSec, streamMode]);

  // Sincronizar estado con el evento nativo de pantalla completa del navegador
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      setIsWallFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullScreen = async () => {
    try {
      const isFs = Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );

      if (!isFs) {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          await docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle error:", err);
      // En caso de bloqueo de permisos del navegador, alternar modo CSS
      setIsWallFullscreen(prev => !prev);
    }
  };

  const handleZoom = (camera, currentSnapshotUrl) => {
    setZoomedCamera({
      ...camera,
      url: currentSnapshotUrl
    });
    setModalAudioEnabled(false);
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

          {/* Selector de intervalo para Snapshots */}
          {streamMode === 'snapshot' && (
            <div className="flex items-center gap-1.5 bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800 text-xs">
              <Clock size={13} className="text-zinc-500" />
              <span className="text-zinc-500 font-medium">Refresco:</span>
              <select 
                value={autoRefreshSec}
                onChange={(e) => handleAutoRefreshChange(e.target.value)}
                className="bg-transparent text-blue-400 border-none outline-none font-bold cursor-pointer"
                title="Intervalo de actualización de instantáneas"
              >
                <option value={3} className="bg-zinc-900 text-zinc-200">3s</option>
                <option value={5} className="bg-zinc-900 text-zinc-200">5s</option>
                {INTERVAL_OPTIONS.map(sec => (
                  <option key={`snap-sec-${sec}`} value={sec} className="bg-zinc-900 text-zinc-200">
                    {sec}s
                  </option>
                ))}
                <option value={0} className="bg-zinc-900 text-zinc-200">Manual (Off)</option>
              </select>
            </div>
          )}

          {/* Controles rápidos de Ronda en la barra superior cuando está activo */}
          {layout === 'patrol' && (
            <div className="flex items-center gap-1.5 bg-zinc-950 px-2.5 py-1 rounded-xl border border-emerald-800/60 text-xs shadow-md shadow-emerald-950/30">
              <button
                type="button"
                onClick={() => setIsPatrolPaused(prev => !prev)}
                className={`p-1 rounded-lg transition-all cursor-pointer ${
                  isPatrolPaused ? 'bg-amber-500 text-black font-bold' : 'hover:bg-zinc-800 text-emerald-400'
                }`}
                title={isPatrolPaused ? "Reanudar ronda" : "Pausar ronda"}
              >
                {isPatrolPaused ? <Play size={13} /> : <Pause size={13} />}
              </button>
              <div className="flex items-center gap-1 font-mono text-[11px] text-zinc-300">
                <Clock size={12} className="text-zinc-500" />
                <span>{isPatrolPaused ? 'Pausa' : `${patrolCountdown}s`}</span>
              </div>
              <span className="text-zinc-700">|</span>
              <select
                value={patrolIntervalSec}
                onChange={(e) => handlePatrolIntervalChange(e.target.value)}
                className="bg-transparent text-emerald-400 font-bold border-none outline-none cursor-pointer text-xs"
                title="Tiempo de rotación de la ronda"
              >
                {INTERVAL_OPTIONS.map(sec => (
                  <option key={`patrol-top-sec-${sec}`} value={sec} className="bg-zinc-900 text-zinc-200">
                    {sec}s
                  </option>
                ))}
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

      <div 
        id="camera-wall-container" 
        className={isWallFullscreen 
          ? "fixed inset-0 z-[9999] w-screen h-screen bg-zinc-950 flex flex-col overflow-hidden" 
          : "flex-1 flex flex-col bg-zinc-950 relative overflow-hidden"}
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
                    src={`/player.html?src=camera_${activeCameras[activePatrolIndex].id}&muted=1`} 
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

                {/* Floating Bottom Patrol Controls con Selector de Tiempo y Progreso */}
                <div className="absolute bottom-6 left-6 z-30 bg-black/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-emerald-900/60 text-xs font-semibold text-zinc-200 shadow-2xl flex flex-col gap-2 select-none overflow-hidden ring-1 ring-emerald-500/20">
                  <div className="flex items-center gap-3.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${isPatrolPaused ? 'bg-amber-400' : 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]'}`} />
                      <span className="text-emerald-400 font-bold">
                        Ronda Activa ({activePatrolIndex + 1} / {activeCameras.length})
                      </span>
                    </div>
                    <span className="text-zinc-700">|</span>
                    
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsPatrolPaused(prev => !prev);
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isPatrolPaused 
                          ? 'bg-amber-500 hover:bg-amber-400 text-black shadow' 
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700'
                      }`}
                      title={isPatrolPaused ? "Reanudar ronda automática" : "Pausar ronda en esta cámara"}
                    >
                      {isPatrolPaused ? <Play size={13} /> : <Pause size={13} />}
                      <span>{isPatrolPaused ? 'Reanudar' : 'Pausar'}</span>
                    </button>

                    <div className="flex items-center gap-1 bg-zinc-900/90 px-2 py-1 rounded-lg border border-zinc-800">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePatrolIndex(prev => (prev > 0 ? prev - 1 : activeCameras.length - 1));
                          setPatrolCountdown(patrolIntervalSec);
                        }}
                        className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition-colors cursor-pointer"
                        title="Cámara anterior"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      
                      <div className="flex items-center gap-1 font-mono text-[11px] text-zinc-300 px-1">
                        <Clock size={12} className="text-emerald-400" />
                        <select
                          value={patrolIntervalSec}
                          onChange={(e) => {
                            e.stopPropagation();
                            handlePatrolIntervalChange(e.target.value);
                          }}
                          className="bg-transparent text-emerald-400 font-bold border-none outline-none cursor-pointer text-xs"
                          title="Seleccionar intervalo de cambio entre cámaras"
                        >
                          {INTERVAL_OPTIONS.map(sec => (
                            <option key={`patrol-float-${sec}`} value={sec} className="bg-zinc-900 text-zinc-200">
                              {sec}s
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePatrolIndex(prev => (prev + 1) % activeCameras.length);
                          setPatrolCountdown(patrolIntervalSec);
                        }}
                        className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded transition-colors cursor-pointer"
                        title="Siguiente cámara"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>

                    <span className="text-[11px] font-mono text-zinc-400">
                      {isPatrolPaused ? '(Pausado)' : `Siguiente en ${patrolCountdown}s`}
                    </span>
                  </div>

                  {/* Barra de progreso de cuenta regresiva */}
                  {!isPatrolPaused && (
                    <div className="w-full bg-zinc-800/80 h-1 rounded-full overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-full transition-all duration-1000 ease-linear rounded-full"
                        style={{ width: `${Math.max(0, Math.min(100, ((patrolIntervalSec - patrolCountdown + 1) / patrolIntervalSec) * 100))}%` }}
                      />
                    </div>
                  )}
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
                  <p className="text-xs text-zinc-400 font-mono flex items-center gap-2">
                    <span>Canal {zoomedCamera.channel}</span>
                    <span>•</span>
                    <span>{modalMode === 'live' ? 'Transmisión en Vivo (Baja Latencia)' : 'Modo Instantánea HD'}</span>
                    <span>•</span>
                    <span className="text-emerald-400/90 font-medium">💾 {zoomedCamera.storage_location || 'Grabación Centralizada en NVR'}</span>
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
                      onClick={() => {
                        setModalMode('snapshot');
                        setIsTalking(false);
                      }}
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

                {/* Botón Audio / Escuchar de la cámara */}
                <button 
                  type="button"
                  onClick={() => {
                    const next = !modalAudioEnabled;
                    setModalAudioEnabled(next);
                    if (modalIframeRef.current && modalIframeRef.current.contentWindow) {
                      modalIframeRef.current.contentWindow.postMessage({ type: 'set_muted', muted: !next }, '*');
                    }
                  }}
                  className={`p-2 rounded-lg transition-all text-xs font-medium flex items-center gap-1.5 active:scale-95 border cursor-pointer ${
                    modalAudioEnabled || isTalking
                      ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-400 font-bold shadow-lg shadow-amber-500/20' 
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border-zinc-700/50'
                  }`}
                  title={modalAudioEnabled || isTalking ? "Silenciar audio" : "Escuchar audio de la cámara"}
                >
                  {modalAudioEnabled || isTalking ? <Volume2 size={14} className="animate-pulse" /> : <VolumeX size={14} />}
                  <span className="hidden sm:inline">{modalAudioEnabled || isTalking ? 'Audio Activo' : 'Silenciado'}</span>
                </button>

                {/* Botón Intercomunicador / Hablar por Micrófono (Ezviz H6c / H8c / Hikvision / Dahua) */}
                {isWebRTCAvailable && zoomedCamera.rtsp_url && modalMode === 'live' && (
                  <button 
                    type="button"
                    onClick={() => {
                      if (!isTalking) {
                        handleStartTalk();
                      } else {
                        handleStopTalk();
                      }
                    }}
                    className={`p-2 rounded-lg transition-all text-xs font-bold flex items-center gap-1.5 active:scale-95 border cursor-pointer ${
                      isTalking 
                        ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-lg shadow-red-600/40 animate-pulse' 
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border-zinc-700/50'
                    }`}
                    title={isTalking ? "Detener transmisión de voz" : "Hablar por el altavoz de la cámara"}
                  >
                    {isTalking ? <Mic size={14} className="text-white animate-bounce" /> : <Mic size={14} className="text-red-400" />}
                    <span className="hidden sm:inline">{isTalking ? '🔴 Transmitiendo Voz' : '🎙️ Hablar por Cámara'}</span>
                  </button>
                )}

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

                {/* Conmutador de Calidad SD (Fluido / Sub-stream) vs HD (Alta Definición / Main-stream) */}
                {isWebRTCAvailable && zoomedCamera.rtsp_url && modalMode === 'live' && (
                  <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 items-center text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => {
                        setModalQuality('sd');
                        setModalStreamKey(prev => prev + 1);
                      }}
                      className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                        modalQuality === 'sd' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                      }`}
                      title="Calidad Fluida: Sub-stream ligero y bajo consumo de red"
                    >
                      SD Fluido
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModalQuality('hd');
                        setModalStreamKey(prev => prev + 1);
                      }}
                      className={`px-2.5 py-1 rounded transition-all cursor-pointer ${
                        modalQuality === 'hd' ? 'bg-emerald-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                      }`}
                      title="Calidad HD: Flujo Principal en Alta Definición 1080p/4K"
                    >
                      HD Máx
                    </button>
                  </div>
                )}

                <button 
                  onClick={() => {
                    handleStopTalk();
                    setZoomedCamera(null);
                    setModalAudioEnabled(false);
                  }}
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
                    handleStopTalk();
                    const currentIdx = activeCameras.findIndex(c => c.id === zoomedCamera.id);
                    const prevIdx = currentIdx > 0 ? currentIdx - 1 : activeCameras.length - 1;
                    const prevCam = activeCameras[prevIdx];
                    setZoomedCamera({
                      ...prevCam,
                      url: `${api.defaults.baseURL}/cameras/${prevCam.id}/snapshot?t=${Date.now()}`
                    });
                    setModalAudioEnabled(false);
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
                    ref={modalIframeRef}
                    key={`modal-stream-${zoomedCamera.id}-${modalQuality}-${modalStreamKey}-${videoFit}`}
                    src={`/player.html?src=${modalQuality === 'hd' ? `camera_${zoomedCamera.id}_hd` : `camera_${zoomedCamera.id}`}&muted=${modalAudioEnabled ? '0' : '1'}&fit=${videoFit}`} 
                    title={zoomedCamera.name}
                    className="w-full h-full max-h-full max-w-full border-0 z-10"
                    scrolling="no"
                    allow="autoplay; fullscreen; microphone; camera; display-capture"
                  />
                ) : (
                  <img 
                    src={zoomedCamera.url || `${api.defaults.baseURL}/cameras/${zoomedCamera.id}/snapshot?t=${Date.now()}`} 
                    alt={zoomedCamera.name} 
                    className={`w-full h-full max-h-full max-w-full ${videoFit === 'cover' ? 'object-cover' : 'object-contain'}`}
                  />
                )}

                {/* Floating Intercom Control Bar (Overlay en la parte inferior del video) */}
                {isWebRTCAvailable && zoomedCamera.rtsp_url && modalMode === 'live' && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 pointer-events-auto">
                    {isTalking ? (
                      <div className="bg-red-950/95 border-2 border-red-500/80 backdrop-blur-md rounded-2xl px-6 py-3 shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-3 duration-300">
                        <div className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 rounded-full bg-red-500 animate-ping" />
                          <Mic size={22} className="text-red-400 animate-bounce" />
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-white tracking-wide uppercase">
                              MICRÓFONO ABIERTO — HABLA AHORA
                            </span>
                            <span className="bg-red-600 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">EN VIVO</span>
                          </div>
                          {/* Medidor de Nivel de Voz VU Meter */}
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-32 h-2.5 bg-black/60 rounded-full overflow-hidden border border-red-500/30 p-0.5 flex items-center">
                              <div 
                                className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500" 
                                style={{ width: `${Math.max(4, audioVolume)}%` }} 
                              />
                            </div>
                            <span className="text-[10px] font-mono text-zinc-300 font-bold">
                              {audioVolume > 10 ? '🎙️ Voz Detectada' : '👂 Escuchando tu voz...'}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleStopTalk}
                          className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-lg transition-all active:scale-95 border border-red-300 cursor-pointer flex items-center gap-1.5"
                        >
                          <MicOff size={14} />
                          <span>Silenciar</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartTalk}
                        className="bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700/80 hover:border-red-500/60 backdrop-blur-md rounded-full px-5 py-2.5 shadow-2xl flex items-center gap-3 transition-all hover:scale-105 active:scale-95 cursor-pointer group"
                        title="Presiona para hablar por el altavoz de esta cámara"
                      >
                        <div className="w-8 h-8 rounded-full bg-red-600/20 group-hover:bg-red-600 flex items-center justify-center transition-colors text-red-400 group-hover:text-white">
                          <Mic size={16} />
                        </div>
                        <div className="flex flex-col text-left">
                          <span className="text-xs font-bold group-hover:text-red-400 transition-colors">Hablar por la Cámara</span>
                          <span className="text-[10px] text-zinc-400">Intercomunicador bidireccional (Ezviz H6c / H8c / IP)</span>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Botón Cámara Siguiente */}
              {activeCameras.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    handleStopTalk();
                    const currentIdx = activeCameras.findIndex(c => c.id === zoomedCamera.id);
                    const nextIdx = currentIdx < activeCameras.length - 1 ? currentIdx + 1 : 0;
                    const nextCam = activeCameras[nextIdx];
                    setZoomedCamera({
                      ...nextCam,
                      url: `${api.defaults.baseURL}/cameras/${nextCam.id}/snapshot?t=${Date.now()}`
                    });
                    setModalAudioEnabled(false);
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

        {/* Modal de Ayuda y Diagnóstico de Permisos de Micrófono */}
        {micHelpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4">
              <div className="flex items-center gap-3 text-amber-400">
                <ShieldAlert size={28} className="shrink-0" />
                <h3 className="text-lg font-bold text-white">Configuración de Micrófono en el Navegador</h3>
              </div>
              
              <p className="text-sm text-zinc-300">
                {micErrorMsg || 'El navegador no permitió acceder al micrófono de tu dispositivo.'}
              </p>

              <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 text-xs flex flex-col gap-2">
                <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                  <Info size={14} className="text-blue-400" />
                  ¿Cómo habilitar el micrófono en la red local (HTTP)?
                </span>
                <p className="text-zinc-400 leading-relaxed">
                  Por seguridad, Chrome y Edge bloquean el micrófono en direcciones IP (HTTP). Para habilitarlo en 1 minuto:
                </p>
                <ol className="list-decimal list-inside text-zinc-300 space-y-1.5 pl-1">
                  <li>
                    Abre una pestaña en tu navegador y ve a:
                    <div className="mt-1 flex items-center gap-2">
                      <code className="bg-zinc-900 px-2 py-1 rounded text-amber-300 font-mono text-[11px] select-all">
                        chrome://flags/#unsafely-treat-insecure-origin-as-secure
                      </code>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText('chrome://flags/#unsafely-treat-insecure-origin-as-secure')}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-200 text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        <Copy size={12} /> Copiar
                      </button>
                    </div>
                  </li>
                  <li>
                    Pega la dirección de este servidor en el campo de texto:
                    <div className="mt-1 flex items-center gap-2">
                      <code className="bg-zinc-900 px-2 py-1 rounded text-emerald-400 font-mono text-[11px] select-all">
                        {`http://${window.location.host}`}
                      </code>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(`http://${window.location.host}`)}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-200 text-[10px] flex items-center gap-1 cursor-pointer"
                      >
                        <Copy size={12} /> Copiar
                      </button>
                    </div>
                  </li>
                  <li>
                    Cambia la opción a <strong className="text-white font-semibold">"Enabled"</strong> y reinicia el navegador.
                  </li>
                </ol>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setMicHelpModal(false)}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg transition-all cursor-pointer"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraWall;
