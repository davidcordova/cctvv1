import React, { useEffect, useRef, useState } from 'react';

const WebRTCPlayer = ({ cameraId, className = '', fallbackSnapshotUrl = '', onConnected }) => {
  const videoRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let ws = null;
    let pc = null;
    let isCancelled = false;

    const startStream = async () => {
      try {
        setIsConnected(false);
        setHasError(false);

        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        // Solicitar audio y video
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = (event) => {
          if (isCancelled) return;
          if (videoRef.current) {
            const stream = event.streams[0] || new MediaStream([event.track]);
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
            setIsConnected(true);
            if (onConnected) onConnected();
          }
        };

        const host = window.location.hostname || 'localhost';
        const wsUrl = `ws://${host}:1984/api/ws?src=camera_${cameraId}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isCancelled || !pc) return;

          pc.onicecandidate = (ev) => {
            if (ev.candidate && ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'webrtc/candidate', value: ev.candidate.candidate }));
            }
          };

          pc.createOffer().then(offer => {
            if (isCancelled || !pc) return;
            return pc.setLocalDescription(offer);
          }).then(() => {
            if (isCancelled || !ws || ws.readyState !== WebSocket.OPEN) return;
            ws.send(JSON.stringify({ type: 'webrtc/offer', value: pc.localDescription.sdp }));
          }).catch(e => {
            if (!isCancelled) setHasError(true);
          });
        };

        ws.onmessage = (ev) => {
          if (isCancelled || !pc) return;
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'webrtc/candidate' && pc.remoteDescription) {
              pc.addIceCandidate({ candidate: msg.value, sdpMid: '0' }).catch(() => {});
            } else if (msg.type === 'webrtc/answer') {
              pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.value })).catch(() => {});
            }
          } catch (e) {
            console.warn("WebRTC msg parse error", e);
          }
        };

        ws.onerror = () => {
          if (!isCancelled) setHasError(true);
        };
      } catch (err) {
        if (!isCancelled) setHasError(true);
      }
    };

    startStream();

    return () => {
      isCancelled = true;
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
      if (pc) {
        try { pc.close(); } catch (e) {}
      }
    };
  }, [cameraId]);

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
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={`w-full h-full object-contain select-none pointer-events-auto ${className}`}
    />
  );
};

export default WebRTCPlayer;
