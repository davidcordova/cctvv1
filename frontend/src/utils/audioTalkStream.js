/**
 * Plan B: Cliente WebSocket de audio bidireccional de baja latencia.
 * Transmite fragmentos de voz del micrófono directamente al servidor
 * para inyección inmediata en el altavoz de la cámara física.
 */
export class AudioTalkClient {
  constructor(cameraId, onStatusChange) {
    this.cameraId = cameraId;
    this.onStatusChange = onStatusChange || (() => {});
    this.ws = null;
    this.mediaRecorder = null;
    this.stream = null;
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Tu navegador no admite acceso al micrófono.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
        channelCount: 1
      }
    });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/v1/cameras/${this.cameraId}/talk-ws`;

    this.ws = new WebSocket(wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.onStatusChange('connected');
      this._startRecording();
    };

    this.ws.onerror = (e) => {
      console.warn('Audio Talk WS Error:', e);
      this.onStatusChange('error');
    };

    this.ws.onclose = () => {
      this.onStatusChange('closed');
    };

    return this.stream;
  }

  _startRecording() {
    if (!this.stream) return;
    
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = '';
    }

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.mediaRecorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
          const buffer = await e.data.arrayBuffer();
          this.ws.send(buffer);
        }
      };
      this.mediaRecorder.start(100); // Fragmentos cada 100ms para latencia ultra baja
    } catch (e) {
      console.warn('MediaRecorder error:', e);
    }
  }

  stop() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {}
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }
}
