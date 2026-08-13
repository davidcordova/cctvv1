import React, { useState, useEffect } from 'react';
import { LayoutGrid, Maximize2, Settings, RefreshCw, Grid3X3, Grid2X2, Camera as CameraIcon, Star, Layers, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

const CameraCard = ({ camera, onZoom, refreshKey, isWebRTCAvailable, isPinned, onPin }) => {
  const [snapshotUrl, setSnapshotUrl] = useState(`${api.defaults.baseURL}/cameras/${camera.id}/snapshot?t=${Date.now()}`);
  const [error, setError] = useState(false);

  // Update snapshot when parent triggers a refresh
  useEffect(() => {
    setSnapshotUrl(`${api.defaults.baseURL}/cameras/${camera.id}/snapshot?t=${Date.now()}`);
    setError(false);
  }, [refreshKey, camera.id]);

  return (
    <div 
      key={camera.id} 
      onClick={() => onZoom(camera, snapshotUrl)}
      className="relative group bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-blue-500/60 transition-all shadow-xl cursor-pointer w-full aspect-video flex flex-col select-none"
    >
      <div className="w-full h-full relative aspect-video flex items-center justify-center bg-black overflow-hidden">
        {isWebRTCAvailable && camera.rtsp_url ? (
          <iframe 
            src={`http://${window.location.hostname}:1984/webrtc.html?src=camera_${camera.id}&mode=webrtc`} 
            title={camera.name}
            className="absolute inset-0 w-full h-full border-0 pointer-events-none"
            scrolling="no"
            allow="autoplay; fullscreen"
          />
        ) : !error ? (
          <img 
            src={snapshotUrl} 
            alt={camera.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setError(true)}
          />
        ) : (
          <div className="text-zinc-600 flex flex-col items-center gap-2">
            <CameraIcon size={32} />
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">CANAL APAGADO / ERROR</span>
          </div>
        )}
        
        {/* Overlay to catch clicks and prevent iframe from eating pointer events */}
        <div className="absolute inset-0 bg-transparent z-10" />
        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors z-10" />

        {/* Pin to Focus button */}
        {onPin && (
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
        <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex justify-between items-end opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-20 pointer-events-none">
           <span className="text-[10px] text-zinc-300 font-mono font-bold bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded border border-zinc-700/60">CH {camera.channel}</span>
           <div className="flex gap-1.5 pointer-events-auto">
             <button 
               className="p-1 rounded bg-black/60 hover:bg-blue-600 text-white transition-all hover:scale-110"
               title="Ampliar vista"
             >
               <Maximize2 size={13} />
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};


const CameraWall = () => {
  const [layout, setLayout] = useState('auto');
  const [customColumns, setCustomColumns] = useState(3);
  const [pinnedCameraId, setPinnedCameraId] = useState(null);
  const [activePatrolIndex, setActivePatrolIndex] = useState(0);
  const [isWallFullscreen, setIsWallFullscreen] = useState(false);
  const [zoomedCamera, setZoomedCamera] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isWebRTCAvailable, setIsWebRTCAvailable] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [refreshKey, setRefreshKey] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    const checkWebRTC = async () => {
      try {
        const res = await api.get('/cameras/webrtc-status');
        if (res.data && res.data.available) {
          setIsWebRTCAvailable(true);
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

  const activeCameras = cameras.filter(c => c.is_active);

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
      if (zoomedCamera || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
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
  }, [totalPages, zoomedCamera]);

  // Cycle through cameras in patrol mode (every 7 seconds)
  useEffect(() => {
    if (layout !== 'patrol' || activeCameras.length === 0) return;
    const interval = setInterval(() => {
      setActivePatrolIndex(prev => (prev + 1) % activeCameras.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [layout, activeCameras.length]);

  const handlePinCamera = (cameraId) => {
    setPinnedCameraId(prev => prev === cameraId ? null : cameraId);
  };

  // Auto-refresh interval (15 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const wallContainer = document.getElementById('camera-wall-container');
      setIsWallFullscreen(document.fullscreenElement === wallContainer);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullScreen = () => {
    const wallContainer = document.getElementById('camera-wall-container');
    if (!document.fullscreenElement) {
      wallContainer?.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const triggerManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['cameras'] });
    setRefreshKey(prev => prev + 1);
  };

  const handleZoom = (camera, currentUrl) => {
    setZoomedCamera({ ...camera, url: currentUrl });
  };

  // Auto-refresh the zoomed camera image in modal
  useEffect(() => {
    if (!zoomedCamera) return;
    const interval = setInterval(() => {
      setZoomedCamera(prev => prev ? {
        ...prev,
        url: `${api.defaults.baseURL}/cameras/${prev.id}/snapshot?t=${Date.now()}`
      } : null);
    }, 5000);
    return () => clearInterval(interval);
  }, [zoomedCamera?.id]);

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedCameras = activeCameras.slice(startIndex, startIndex + pageSize);

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 relative overflow-hidden">
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Muro de Cámaras</h1>
          <div className="h-6 w-[1px] bg-zinc-800 mx-2" />
          
          {/* Layout Selector Button Group */}
          <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 items-center gap-1">
            <button 
              onClick={() => setLayout('auto')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${layout === 'auto' ? 'bg-zinc-800 text-blue-400 shadow-inner' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Vista Adaptable 16:9"
            >
              Auto 16:9
            </button>
            <button 
              onClick={() => setLayout('cols-2')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${layout === 'cols-2' ? 'bg-zinc-800 text-blue-400 shadow-inner' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Vista 2x2"
            >
              2x2
            </button>
            <button 
              onClick={() => setLayout('cols-3')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${layout === 'cols-3' ? 'bg-zinc-800 text-blue-400 shadow-inner' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Vista 3x3"
            >
              3x3
            </button>
            <button 
              onClick={() => setLayout('cols-4')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${layout === 'cols-4' ? 'bg-zinc-800 text-blue-400 shadow-inner' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Vista 4x4"
            >
              4x4
            </button>
            
            <div className="w-[1px] h-4 bg-zinc-800 mx-1" />
            
            <button 
              onClick={() => setLayout('focus')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${layout === 'focus' ? 'bg-zinc-800 text-blue-400 shadow-inner' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Enfoque Principal (1+N)"
            >
              Enfoque
            </button>
            <button 
              onClick={() => setLayout('patrol')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${layout === 'patrol' ? 'bg-zinc-800 text-blue-400 shadow-inner' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Ronda Secuencial"
            >
              Ronda
            </button>
            <button 
              onClick={() => setLayout('custom')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${layout === 'custom' ? 'bg-zinc-800 text-blue-400 shadow-inner' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Vista Personalizada"
            >
              Personalizado
            </button>
          </div>

          {/* Custom Columns Slider */}
          {layout === 'custom' && (
            <div className="flex items-center gap-2 px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-xs animate-in slide-in-from-left duration-200">
              <span className="text-zinc-500">Columnas:</span>
              <input 
                type="range" 
                min="1" 
                max="6" 
                value={customColumns} 
                onChange={(e) => setCustomColumns(parseInt(e.target.value))}
                className="w-16 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500" 
              />
              <span className="text-blue-400 font-bold font-mono">{customColumns}</span>
            </div>
          )}

          {/* Pagination Controls in Header */}
          {totalPages > 1 && layout !== 'patrol' && (
            <div className="flex items-center bg-zinc-950 px-2 py-1 rounded-lg border border-zinc-800 text-xs gap-1.5 animate-in fade-in duration-300">
              <button 
                onClick={() => setCurrentPage(prev => (prev > 1 ? prev - 1 : totalPages))}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-all active:scale-95"
                title="Página Anterior (Flecha Izquierda)"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-mono text-zinc-300 font-semibold px-1 select-none">
                Pág <span className="text-blue-400 font-bold">{currentPage}</span> / {totalPages}
              </span>
              <button 
                onClick={() => setCurrentPage(prev => (prev < totalPages ? prev + 1 : 1))}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-all active:scale-95"
                title="Página Siguiente (Flecha Derecha)"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-800 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={autoRefresh} 
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-zinc-800 bg-zinc-950 text-blue-600 focus:ring-0 focus:ring-offset-0"
            />
            <span>Auto-refrescar (15s)</span>
          </label>

          <button 
            onClick={triggerManualRefresh}
            className={`p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-all ${isRefetching ? 'animate-spin text-blue-400' : 'hover:text-white'}`}
            title="Actualizar todo"
          >
            <RefreshCw size={20} />
          </button>
          <button 
            onClick={toggleFullScreen}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-all text-sm shadow-lg shadow-blue-600/20 active:scale-95 flex items-center gap-2"
          >
            <Maximize2 size={16} />
            Pantalla Completa
          </button>
        </div>
      </header>

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
          /* Patrol Mode - 1 camera cycling full screen in 16:9 */
          <div className="flex-1 p-6 relative overflow-hidden flex items-center justify-center h-full bg-zinc-950">
            {activeCameras[activePatrolIndex] && (
              <div className="w-full max-w-5xl aspect-video">
                <CameraCard 
                  camera={activeCameras[activePatrolIndex]} 
                  onZoom={handleZoom} 
                  refreshKey={refreshKey} 
                  isWebRTCAvailable={isWebRTCAvailable} 
                />
              </div>
            )}
            <div className="absolute bottom-6 left-6 z-30 bg-black/85 backdrop-blur-md px-4 py-2 rounded-xl border border-zinc-800 text-xs font-semibold text-blue-400 shadow-xl flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
              <span>Ronda Activa ({activePatrolIndex + 1} / {activeCameras.length}) • Siguiente en 7s</span>
            </div>
          </div>
        ) : layout === 'focus' ? (
          /* Focus Mode - 1 large 16:9 camera on left, N small 16:9 on right with paginated slide grid */
          (() => {
            const focusCam = activeCameras.find(c => c.id === pinnedCameraId) || activeCameras[0];
            const otherCams = activeCameras.filter(c => c.id !== focusCam.id);
            const focusPageSize = 6;
            const focusTotalPages = Math.ceil(otherCams.length / focusPageSize) || 1;
            const focusStartIndex = (currentPage - 1) * focusPageSize;
            const focusPaginatedOthers = otherCams.slice(focusStartIndex, focusStartIndex + focusPageSize);

            return (
              <div className="flex-1 flex flex-col md:flex-row gap-4 p-4 md:p-6 overflow-y-auto h-full relative">
                {/* Left Side: Large Camera */}
                <div className="w-full md:w-[68%] flex flex-col justify-start">
                  <div className="w-full aspect-video">
                    <CameraCard 
                      camera={focusCam} 
                      onZoom={handleZoom} 
                      refreshKey={refreshKey} 
                      isWebRTCAvailable={isWebRTCAvailable} 
                      isPinned={focusCam.id === pinnedCameraId}
                      onPin={handlePinCamera}
                    />
                  </div>
                  <p className="text-xs text-zinc-500 mt-2 font-medium">★ Haz clic en la estrella de cualquier cámara secundaria para cambiar la vista principal.</p>
                </div>
                {/* Right Side: Grid of paginated secondary cameras */}
                <div className="w-full md:w-[32%] flex flex-col justify-between">
                  <div key={currentPage} className="grid gap-4 grid-cols-1 xl:grid-cols-2 animate-in fade-in zoom-in-95 duration-300">
                    {focusPaginatedOthers.map(cam => (
                      <div key={cam.id} className="w-full aspect-video">
                        <CameraCard 
                          camera={cam} 
                          onZoom={handleZoom} 
                          refreshKey={refreshKey} 
                          isWebRTCAvailable={isWebRTCAvailable} 
                          isPinned={cam.id === pinnedCameraId}
                          onPin={handlePinCamera}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          /* Standard 16:9 Grid Layouts (Auto, 2x2, 3x3, 4x4, Custom) with Slideshow Pages */
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
              {paginatedCameras.map((camera) => (
                <div key={camera.id} className="w-full aspect-video">
                  <CameraCard 
                    camera={camera} 
                    onZoom={handleZoom} 
                    refreshKey={refreshKey} 
                    isWebRTCAvailable={isWebRTCAvailable} 
                    isPinned={camera.id === pinnedCameraId}
                    onPin={handlePinCamera}
                  />
                </div>
              ))}
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

        {/* Camera Zoom Modal */}
        {zoomedCamera && (
          <div 
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col animate-in fade-in duration-200"
            onClick={() => setZoomedCamera(null)}
          >
            <div className="h-16 px-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  {zoomedCamera.name}
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                </h2>
                <p className="text-xs text-zinc-400 font-mono">Canal {zoomedCamera.channel} • Transmisión en Vivo</p>
              </div>
              <button 
                onClick={() => setZoomedCamera(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-4 py-2 rounded-lg font-medium transition-all text-sm active:scale-95"
              >
                Cerrar
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-4 md:p-8" onClick={(e) => e.stopPropagation()}>
              <div className="max-w-6xl w-full aspect-video rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl bg-black relative flex items-center justify-center">
                {isWebRTCAvailable && zoomedCamera.rtsp_url ? (
                  <iframe 
                    src={`http://${window.location.hostname}:1984/webrtc.html?src=camera_${zoomedCamera.id}&mode=webrtc`} 
                    title={zoomedCamera.name}
                    className="w-full h-full border-0"
                    scrolling="no"
                    allow="autoplay; fullscreen"
                  />
                ) : (
                  <img 
                    src={zoomedCamera.url} 
                    alt={zoomedCamera.name} 
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CameraWall;
