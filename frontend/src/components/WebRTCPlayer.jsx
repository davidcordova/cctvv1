import React, { useEffect, useRef, useState } from 'react';

const WebRTCPlayer = ({ cameraId, className = '', fallbackSnapshotUrl = '', onConnected }) => {
  const containerRef = useRef(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const host = window.location.hostname || 'localhost';
    const container = containerRef.current;
    if (!container || !cameraId) return;

    container.innerHTML = '';
    const player = document.createElement('video-rtc');
    player.src = `ws://${host}:1984/api/ws?src=camera_${cameraId}`;
    player.mode = 'webrtc,mse,hls';
    player.background = true;
    player.className = `w-full h-full object-contain ${className}`;

    const handleLoaded = () => {
      const v = player.querySelector('video');
      if (v) {
        v.muted = true;
        v.play().catch(() => {});
      }
      if (onConnected) onConnected();
    };

    player.addEventListener('loadeddata', handleLoaded);
    player.addEventListener('playing', handleLoaded);

    container.appendChild(player);

    return () => {
      container.innerHTML = '';
    };
  }, [cameraId, className, onConnected]);

  if (hasError && fallbackSnapshotUrl) {
    return (
      <img
        src={fallbackSnapshotUrl}
        alt="Camera Preview"
        className={`w-full h-full object-contain ${className}`}
      />
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
