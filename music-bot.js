class DiscordMusicBot {
  constructor(socket) {
    this.socket = socket;
    this.audioElement = null;
    this.isStreaming = false;

    this.setupAudioElement();
    this.setupListeners();
  }

  setupAudioElement() {
    let audio = document.getElementById('discord-music-player');

    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'discord-music-player';
      audio.style.display = 'none';
      audio.preload = 'auto';
      document.body.appendChild(audio);
    }

    this.audioElement = audio;

    // Detectar cuando el audio termina de reproducirse de forma natural
    this.audioElement.onended = () => {
      console.log('🏁 Reproducción de la pista finalizada por el elemento de audio.');
      
      const channel = typeof activeVoiceChannel !== 'undefined' ? activeVoiceChannel : 'General';

      // AVISAR AL SERVIDOR QUE TERMINE LA PISTA Y PASE A LA SIGUIENTE
      this.socket.emit('song-ended', { channel });
    };
  }

  setupListeners() {

    this.socket.on('new-message', (msg) => {
      this.handleCommand(msg);
    });

    this.socket.on('bot-message', (data) => {
      this.botReply(data.text);
    });

    // =====================================================
    // INICIO DE UNA CANCIÓN (Streaming HTTP por Rangos)
    // =====================================================

    this.socket.on('start-audio-stream', (data) => {
      console.log('🎵 Iniciando:', data.title);

      this.resetPlayer();

      if (!data.url) {
        console.error('No se recibió una URL de audio válida.');
        return;
      }

      this.isStreaming = true;

      // Apuntamos la URL HTTP generada por Express directamente al elemento de audio.
      // El navegador gestiona el archivo en segundo plano mediante Range Requests (ideal para canciones de 2 horas).
      this.audioElement.src = data.url;
      
      this.audioElement.play()
        .then(() => {
          console.log('▶️ Reproduciendo audio por HTTP nativo');
        })
        .catch(error => {
          console.log('⚠️ El navegador necesita interacción o hubo un error al reproducir:', error);
        });
    });

    // =====================================================
    // FIN DEL STREAM (Mantenemos por compatibilidad)
    // =====================================================

    this.socket.on('end-audio-stream', () => {
      console.log('🏁 El servidor indicó fin de transmisión.');
      this.isStreaming = false;
    });

    // =====================================================
    // DETENER
    // =====================================================

    this.socket.on('stop-audio-stream', () => {
      console.log('⏹️ Stream detenido.');
      this.resetPlayer();
    });

  }

  // =======================================================
  // REINICIAR REPRODUCTOR
  // =======================================================

  resetPlayer() {
    this.isStreaming = false;

    if (this.audioElement) {
      this.audioElement.pause();

      try {
        this.audioElement.currentTime = 0;
        this.audioElement.removeAttribute('src');
        this.audioElement.load();
      } catch (e) {}
    }
  }

  // =======================================================
  // COMANDOS
  // =======================================================

  handleCommand(msg) {

    const text = msg.text.trim();

    if (!text.startsWith('!')) return;

    const args =
      text.slice(1).split(/\s+/);

    const command =
      args[0].toLowerCase();

    const query =
      args.slice(1).join(' ');

    const channel =
      typeof activeVoiceChannel !== 'undefined'
        ? activeVoiceChannel
        : 'General';

    const user =
      typeof username !== 'undefined'
        ? username
        : 'Usuario';

    if (command === 'play') {

      if (!query) {

        this.botReply(
          '⚠️ Por favor, ingresa un enlace de YouTube válido.'
        );

        return;
      }

      this.socket.emit(
        'play-music',
        {
          channel,
          url: query,
          username: user
        }
      );

    }

    else if (command === 'skip') {

      this.socket.emit(
        'skip-music',
        { channel }
      );

    }

    else if (command === 'stop') {

      this.socket.emit(
        'stop-music',
        { channel }
      );

    }

  }
  // =======================================================
  // CONTROL DE VOLUMEN
  // =======================================================

  setVolume(volumeValue) {
    if (this.audioElement) {
      // El valor va de 0.0 a 1.0
      this.audioElement.volume = Math.max(0, Math.min(1, parseFloat(volumeValue)));
      console.log(`[MusicBot] Volumen actualizado a: ${this.audioElement.volume * 100}%`);
    }
  }

  // =======================================================
  // MENSAJE DEL BOT
  // =======================================================

  botReply(text) {

    const messagesBox =
      document.getElementById('messages');

    if (!messagesBox) return;

    const html = `
      <div class="msg-item">

        <div
          class="avatar-img"
          style="background: #23a55a;"
        >
          🤖
        </div>

        <div class="msg-content">

          <div class="msg-header">

            <span
              class="msg-username"
              style="color: #23a55a;"
            >
              Music Bot
            </span>

            <span
              style="font-size: 10px; color: #949ba4;"
            >
              Bot
            </span>

          </div>

          <div class="msg-text">
            ${text}
          </div>

        </div>

      </div>
    `;

    messagesBox.insertAdjacentHTML(
      'beforeend',
      html
    );

    messagesBox.scrollTop =
      messagesBox.scrollHeight;

  }
}