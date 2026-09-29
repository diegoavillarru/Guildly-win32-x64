// video-player.js
class SyncVideoPlayer {
  constructor(socketInstance) {
    this.socket = socketInstance;
    this.isRemoteTriggered = false;
    this.hlsInstance = null;
  }

  mount(parentElementId) {
    const parent = document.getElementById(parentElementId);
    if (!parent) return;

    this.unmount();

    const playerHTML = `
      <div id="sync-player-wrapper" style="background: #111; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #444;">
        <h4 style="margin: 0 0 10px 0; color: #fff;">🎬 Cine / Sala de Películas</h4>
        
        <div style="display: flex; gap: 8px; margin-bottom: 10px;">
          <input type="text" id="video-url-input" placeholder="Pega enlace de Video URL Finder (.mp4 o .m3u8)..." style="flex: 1; padding: 6px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px;">
          <button id="load-video-btn" style="background: #5865f2; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;">Cargar</button>
        </div>

        <div style="position: relative; width: 100%; background: #000; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; border-radius: 4px; overflow: hidden;">
          <video id="shared-video-element" style="width: 100%; height: 100%;" controls playsinline></video>
        </div>
      </div>
    `;
    
    parent.insertAdjacentHTML('beforeend', playerHTML);
    
    const loadBtn = document.getElementById('load-video-btn');
    if (loadBtn) {
      loadBtn.onclick = () => this.changeVideo();
    }

    this.loadHlsScript();
    this.initListeners();
  }

  loadHlsScript() {
    if (window.Hls) return;
    if (!document.getElementById('hls-js-library')) {
      const script = document.createElement('script');
      script.id = 'hls-js-library';
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
      document.head.appendChild(script);
    }
  }

  initListeners() {
    const video = document.getElementById('shared-video-element');
    if (!video) return;

    video.onplay = () => {
      if (this.isRemoteTriggered) return;
      this.socket.emit('video-action', {
        action: 'play',
        currentTime: video.currentTime,
        channel: 'PeliculasManga'
      });
    };

    video.onpause = () => {
      if (this.isRemoteTriggered) return;
      this.socket.emit('video-action', {
        action: 'pause',
        currentTime: video.currentTime,
        channel: 'PeliculasManga'
      });
    };

    video.onseeking = () => {
      if (this.isRemoteTriggered) return;
      this.socket.emit('video-action', {
        action: 'seek',
        currentTime: video.currentTime,
        channel: 'PeliculasManga'
      });
    };

    if (!this.socket.hasListeners('video-sync')) {
      this.socket.on('video-sync', (data) => {
        const activeVideo = document.getElementById('shared-video-element');
        if (!activeVideo) return;

        this.isRemoteTriggered = true;
        if (data.action === 'play') {
          if (Math.abs(activeVideo.currentTime - data.currentTime) > 0.5) {
            activeVideo.currentTime = data.currentTime;
          }
          activeVideo.play().catch(() => {});
        } else if (data.action === 'pause') {
          activeVideo.pause();
          activeVideo.currentTime = data.currentTime;
        } else if (data.action === 'seek') {
          activeVideo.currentTime = data.currentTime;
        }
        setTimeout(() => { this.isRemoteTriggered = false; }, 300);
      });
    }

    if (!this.socket.hasListeners('video-url-sync')) {
      this.socket.on('video-url-sync', (data) => {
        this.loadSource(data.url);
      });
    }
  }

  loadSource(url) {
    const video = document.getElementById('shared-video-element');
    if (!video) return;

    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }

    if (url.includes('.m3u8')) {
      if (window.Hls && Hls.isSupported()) {
        this.hlsInstance = new Hls();
        this.hlsInstance.loadSource(url);
        this.hlsInstance.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Soporte nativo para Safari/iOS
        video.src = url;
      }
    } else {
      video.src = url;
      video.load();
    }
  }

  changeVideo() {
    const input = document.getElementById('video-url-input');
    if (!input || !input.value.trim()) return;
    const url = input.value.trim();
    
    this.socket.emit('video-url-change', { url, channel: 'PeliculasManga' });
    this.loadSource(url);
  }

  unmount() {
    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }
    const wrapper = document.getElementById('sync-player-wrapper');
    if (wrapper) wrapper.remove();
  }
}