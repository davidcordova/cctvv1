import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const WebRTCPlayer = ({ 
  cameraId, 
  className = '', 
  fallbackSnapshotUrl = '', 
  onConnected,
  onError,
  cameraName = ''
}) => {
  const containerRef = useRef(null);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const host = window.location.hostname || 'localhost';
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const container = containerRef.current;
    if (!container || !cameraId) return;

    setHasError(false);
    container.innerHTML = '';
    const player = document.createElement('video-rtc');
    player.src = `${wsProto}//${host}:1984/api/ws?src=camera_${cameraId}`;
    const supportsMse = ('MediaSource' in window || 'ManagedMediaSource' in window);
    player.mode = supportsMse ? 'mse' : 'webrtc';
    player.media = 'video';
    player.background = true;
    player.className = `w-full h-full object-contain ${className}`;

    let connected = false;

    const handleLoaded = () => {
      connected = true;
      const v = player.querySelector('video');
      if (v) {
        v.muted = true;
        v.play().catch(() => {});
      }
      if (onConnected) onConnected();
    };

    player.addEventListener('loadeddata', handleLoaded);
    player.addEventListener('playing', handleLoaded);

    // Watchdog de 6 segundos
    const timer = setTimeout(() => {
      if (!connected) {
        setHasError(true);
        setErrorMessage('Tiempo de espera agotado al recibir señal');
        if (onError) onError('timeout');
      }
    }, 6000);

    container.appendChild(player);

    return () => {
      clearTimeout(timer);
      container.innerHTML = '';
    };
  }, [cameraId, className, onConnected, onError, retryKey]);

  if (hasError) {
    if (fallbackSnapshotUrl) {
      return (
        <div className="relative w-full h-full">
          <img
            src={`${fallbackSnapshotUrl}&t=${retryKey}`}
            alt={cameraName || 'Camera Preview'}
            className={`w-full h-full object-contain ${className}`}
            onError={() => setErrorMessage('Sin señal de video ni fotograma')}
          />
          <button
            type="button"
            onClick={() => setRetryKey(k => k + 1)}
            className="absolute bottom-2 right-2 bg-black/80 hover:bg-blue-600 text-white p-1.5 rounded-lg text-xs font-semibold shadow flex items-center gap-1 border border-zinc-700"
          >
            <RefreshCw size={12} />
            <span>Reintentar</span>
          </button>
        </div>
      );
    }

    return (
      <div className="w-full h-full bg-zinc-950 flex flex-col items-center justify-center p-4 text-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
          <AlertTriangle size={20} />
        </div>
        <p className="text-xs font-bold text-rose-400">Señal no disponible</p>
        <p className="text-[11px] text-zinc-500 max-w-xs">{errorMessage || 'No se pudo establecer conexión con el stream'}</p>
        <button
          type="button"
          onClick={() => setRetryKey(k => k + 1)}
          className="mt-1 px-3 py-1 bg-zinc-800 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold border border-zinc-700 transition-all flex items-center gap-1"
        >
          <RefreshCw size={12} />
          <span>Reintentar</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative overflow-hidden bg-black flex items-center justify-center ${className}`}
    />
  );
};

export default WebRTCPlayer;

