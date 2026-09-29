let localStream = null;
let localCameraStream = null;
let activeVoiceChannel = 'General';
let isConnectedToVoice = false;
let peerConnection = null;
let screenSender = null;

let isCameraActive = false;
let isScreenSharing = false;

let isMuted = false;
let isDeafened = false;
let audioContext = null;
let analyser = null;
let microphone = null;
let javascriptNode = null;
let lastSpeakingState = false;

const rtcConfig = { 
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ] 
};

socket.on('room-users-update', (users) => {
  const grid = document.getElementById('users-grid');
  grid.innerHTML = ''; 
  users.forEach(u => {
    const isMe = (u.id === socket.id);
    const displayName = u.username + (isMe ? ' (Tú)' : '');
    renderUserCard(u.id, displayName, u.avatar, isMe && isCameraActive ? document.getElementById('video-local-user')?.srcObject : null);
  });
});

socket.on('user-disconnected', (userId) => {
  const card = document.getElementById('card-' + userId);
  if (card) card.remove();
  removeStreamCard('stream-' + userId + '-camera');
  removeStreamCard('stream-' + userId + '-screen');
});

socket.on('user-speaking', (data) => {
  const card = document.getElementById('card-' + data.userId);
  if (card) {
    card.classList.toggle('speaking', data.speaking);
  }
});

function selectVoiceChannel(name) {
  ['General', 'Gaming', 'Musica', 'PeliculasManga'].forEach(c => {
    const el = document.getElementById('vchan-' + c);
    if (el) el.classList.remove('active');
  });
  
  activeVoiceChannel = name;
  const activeEl = document.getElementById('vchan-' + name);
  if (activeEl) activeEl.classList.add('active');

  if (name === 'PeliculasManga') {
    if (!document.getElementById('sync-player-wrapper')) {
      window.syncPlayer.mount('voice-stage');
    }
  } else {
    window.syncPlayer.unmount();
  }

  if (isConnectedToVoice) {
    socket.emit('join-voice-channel', {
      channel: activeVoiceChannel,
      user: { username: username, avatar: (avatarVoiceUrl || avatarChatUrl || '').trim() }
    });
    document.getElementById('voice-channel-title').innerText = '🔊 Canal: ' + activeVoiceChannel;
    
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    setupPeerConnection();
    sendOffer();
  }
}

function toggleVoice() {
  if (!isConnectedToVoice) {
    connectVoice();
  } else {
    disconnectVoice();
  }
}

async function connectVoice() {
  try {
    const constraints = {
      audio: selectedAudioInputId ? { deviceId: { exact: selectedAudioInputId } } : true,
      video: false
    };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    setupVoiceActivityDetector(localStream, socket.id || 'local-user');
    setupPeerConnection();

    document.getElementById('voice-stage').style.display = 'flex';
    document.getElementById('voice-channel-title').innerText = '🔊 Canal: ' + activeVoiceChannel;
    
    socket.emit('join-voice-channel', {
      channel: activeVoiceChannel,
      user: { username: username, avatar: (avatarVoiceUrl || avatarChatUrl || '').trim() }
    });

    const btn = document.getElementById('voice-btn');
    btn.innerText = '🔇 Desconectar Voz';
    btn.classList.add('disconnect');
    document.getElementById('voice-status').innerText = '🎙️ Conectado a ' + activeVoiceChannel;
    
    document.getElementById('camera-btn').disabled = false;
    document.getElementById('screen-btn').disabled = false;
    isConnectedToVoice = true;
    playCustomConnectSound();

    sendOffer();
  } catch (err) {
    console.error('Error de micrófono:', err);
    playCustomErrorSound();
  }
}

function disconnectVoice() {
  if (isCameraActive) toggleCamera();
  if (isScreenSharing) stopScreenShare();

  socket.emit('leave-voice-channel');

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  document.querySelectorAll('audio[id^="remote-audio"]').forEach(el => el.remove());
  document.getElementById('users-grid').innerHTML = '';
  document.getElementById('streams-grid').innerHTML = '';
  document.getElementById('voice-stage').style.display = 'none';

  window.syncPlayer.unmount();

  const btn = document.getElementById('voice-btn');
  btn.innerText = '🔊 Conectar a Voz';
  btn.classList.remove('disconnect');
  document.getElementById('voice-status').innerText = '';
  
  document.getElementById('camera-btn').disabled = true;
  document.getElementById('screen-btn').disabled = true;
  
  isConnectedToVoice = false;
  playCustomDisconnectSound();
}

async function sendOffer() {
  if (!peerConnection) return;
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { offer, target: activeVoiceChannel, hasCamera: isCameraActive, hasScreen: isScreenSharing, username: username });
  } catch (e) {
    console.error('Error enviando oferta WebRTC:', e);
  }
}

function setupPeerConnection() {
  if (peerConnection) return;
  peerConnection = new RTCPeerConnection(rtcConfig);

  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  peerConnection.ontrack = async (event) => {
    const stream = event.streams[0];
    if (localStream && stream.id === localStream.id) return;
    if (localCameraStream && stream.id === localCameraStream.id) return;

    if (event.track.kind === 'audio') {
      const audioId = 'remote-audio-' + stream.id;
      let audioEl = document.getElementById(audioId);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = audioId;
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
      }
      audioEl.srcObject = stream;
      audioEl.muted = isDeafened;
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { candidate: event.candidate, target: activeVoiceChannel });
    }
  };
}

socket.on('signal', async (data) => {
  try {
    if (data.offer) {
      if (!localStream) {
        const constraints = {
          audio: selectedAudioInputId ? { deviceId: { exact: selectedAudioInputId } } : true,
          video: false
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        setupVoiceActivityDetector(localStream, socket.id || 'local-user');
      }
      setupPeerConnection();
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      document.getElementById('voice-stage').style.display = 'flex';
      
      if (activeVoiceChannel === 'PeliculasManga' && !document.getElementById('sync-player-wrapper')) {
        window.syncPlayer.mount('voice-stage');
      }

      const btn = document.getElementById('voice-btn');
      btn.innerText = '🔇 Desconectar Voz';
      btn.classList.add('disconnect');
      document.getElementById('voice-status').innerText = '🎙️ Conectado a Voz';
      
      document.getElementById('camera-btn').disabled = false;
      document.getElementById('screen-btn').disabled = false;
      isConnectedToVoice = true;

      socket.emit('signal', { answer, target: data.sender });
    } else if (data.answer && peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.candidate && peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }

    if (data.sender && (data.hasCamera !== undefined || data.hasScreen !== undefined)) {
      updateRemoteStreamCardStatus(data.sender, data.username || 'Remoto', data.hasCamera, data.hasScreen);
    }
  } catch (err) {
    console.error('Error procesando señal de socket:', err);
  }
});

function updateRemoteStreamCardStatus(senderId, senderName, hasCamera, hasScreen) {
  let cameraStream = null;
  let screenStream = null;

  if (peerConnection) {
    const remoteVideoTracks = [];
    if (typeof peerConnection.getRemoteStreams === 'function') {
      peerConnection.getRemoteStreams().forEach(stream => {
        remoteVideoTracks.push(...stream.getVideoTracks());
      });
    }
    
    if (remoteVideoTracks.length === 0) {
      peerConnection.getReceivers().forEach(receiver => {
        if (receiver.track && receiver.track.kind === 'video') {
          remoteVideoTracks.push(receiver.track);
        }
      });
    }

    if (remoteVideoTracks.length >= 2) {
      cameraStream = new MediaStream([remoteVideoTracks[0]]);
      screenStream = new MediaStream([remoteVideoTracks[1]]);
    } else if (remoteVideoTracks.length === 1) {
      if (hasCamera && !hasScreen) cameraStream = new MediaStream([remoteVideoTracks[0]]);
      else if (hasScreen && !hasCamera) screenStream = new MediaStream([remoteVideoTracks[0]]);
      else {
        cameraStream = new MediaStream([remoteVideoTracks[0]]);
        screenStream = new MediaStream([remoteVideoTracks[0]]);
      }
    }
  }
  
  renderStreamCard('stream-' + senderId + '-camera', senderName + ' (Cámara)', cameraStream, hasCamera, 'camera');
  renderStreamCard('stream-' + senderId + '-screen', senderName + ' (Pantalla)', screenStream, hasScreen, 'screen');
}

function toggleMute() {
  isMuted = !isMuted;
  const muteBtn = document.getElementById('mute-btn');
  
  if (localStream) {
    localStream.getAudioTracks().forEach(track => { track.enabled = !isMuted; });
  }

  if (isMuted) {
    muteBtn.innerText = '🔇';
    muteBtn.classList.add('btn-control-muted');
    playCustomClickSound(isMuted);
  } else {
    muteBtn.innerText = '🎤';
    muteBtn.classList.remove('btn-control-muted');
  }
}

function toggleDeafen() {
  isDeafened = !isDeafened;
  const deafenBtn = document.getElementById('deafen-btn');
  document.querySelectorAll('audio[id^="remote-audio"]').forEach(el => {
    el.muted = isDeafened;
  });

  if (isDeafened) {
    deafenBtn.innerText = '🔇';
    deafenBtn.classList.add('btn-control-muted');
    if (!isMuted) toggleMute();
  } else {
    deafenBtn.innerText = '🎧';
    deafenBtn.classList.remove('btn-control-muted');
    if (isMuted) toggleMute();
  }
}

function setupVoiceActivityDetector(stream, cardId) {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    analyser = audioContext.createAnalyser();
    microphone = audioContext.createMediaStreamSource(stream);
    javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 1024;

    microphone.connect(analyser);
    analyser.connect(javascriptNode);
    javascriptNode.connect(audioContext.destination);

    javascriptNode.onaudioprocess = function() {
      const array = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(array);
      let values = 0;
      for (let i = 0; i < array.length; i++) values += array[i];

      const average = values / array.length;
      const isSpeaking = average > 15 && !isMuted;
      
      const card = document.getElementById('card-' + cardId);
      if (card) {
        card.classList.toggle('speaking', isSpeaking);
      }

      if (cardId === (socket.id || 'local-user') || cardId.includes('local')) {
        if (isSpeaking !== lastSpeakingState) {
          lastSpeakingState = isSpeaking;
          socket.emit('speaking-status', { speaking: isSpeaking });
        }
      }
    };
  } catch (e) {
    console.error('Error detector de voz:', e);
  }
}

async function toggleCamera() {
  if (!isConnectedToVoice) return;
  const isVideoOn = !!localCameraStream;

  if (!isVideoOn) {
    try {
      localCameraStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, 
        audio: false 
      });
      
      const videoTrack = localCameraStream.getVideoTracks()[0];
      videoTrack.onended = () => toggleCamera();

      addVideoTrackToConnection(videoTrack);
      renderStreamCard('local-camera', username + ' (Cámara)', localCameraStream, true, 'camera');

      isCameraActive = true;
      const btnElement = document.getElementById('camera-btn');
      if (btnElement) {
        btnElement.textContent = "🛑 Desactivar Cámara";
        btnElement.classList.add('active');
      }
      playCustomCameraSound(true);
      sendOffer();
    } catch (error) {
      console.error("No se pudo acceder a la cámara:", error);
      playCustomErrorSound();
    }
  } else {
    removeVideoTrackFromConnection(localCameraStream?.getVideoTracks()[0]);
    if (localCameraStream) {
      localCameraStream.getTracks().forEach(track => track.stop());
      localCameraStream = null;
    }

    renderStreamCard('local-camera', username + ' (Cámara)', null, false, 'camera');

    isCameraActive = false;
    const btnElement = document.getElementById('camera-btn');
    if (btnElement) {
      btnElement.textContent = "📹 Activar Cámara";
      btnElement.classList.remove('active');
    }
    playCustomCameraSound(false);
    sendOffer();
  }
}

async function toggleScreenShare() {
  if (!isConnectedToVoice) return;

  if (isScreenSharing) {
    stopScreenShare();
  } else {
    try {
      const qualitySelect = document.getElementById('screen-quality');
      const quality = qualitySelect ? qualitySelect.value : '1080_30';
      let videoConstraints = { video: true, audio: false };

      if (quality.startsWith('720')) videoConstraints = { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: quality.endsWith('60') ? 60 : 30 } }, audio: false };
      else if (quality.startsWith('1080')) videoConstraints = { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: quality.endsWith('60') ? 60 : 30 } }, audio: false };
      else if (quality.startsWith('original')) videoConstraints = { video: { width: { ideal: window.screen.width }, height: { ideal: window.screen.height }, frameRate: { ideal: quality.endsWith('60') ? 60 : 30 } }, audio: false };

      const screenStream = await navigator.mediaDevices.getDisplayMedia(videoConstraints);
      const videoTrack = screenStream.getVideoTracks()[0];
      videoTrack.onended = () => stopScreenShare();

      screenSender = addVideoTrackToConnection(videoTrack);
      const bitrateInput = document.getElementById('screen-bitrate');
      const initialBitrate = bitrateInput ? parseInt(bitrateInput.value) * 1000 : 5000000;
      updateSenderBitrate(screenSender, initialBitrate);

      renderStreamCard('local-screen', username + ' (Pantalla)', new MediaStream([videoTrack]), true, 'screen');

      isScreenSharing = true;
      document.getElementById('screen-btn').classList.add('active');
      document.getElementById('screen-btn').innerText = '🖥️ Detener Pantalla';
      playCustomStreamSound(true);
      sendOffer();
    } catch (err) {
      console.error('Error pantalla:', err);
      playCustomErrorSound();
    }
  }
}

function stopScreenShare() {
  if (peerConnection) {
    peerConnection.getSenders().forEach(sender => {
      if (sender.track && sender.track.kind === 'video') {
        sender.track.stop();
        peerConnection.removeTrack(sender);
      }
    });
  }

  isScreenSharing = false;
  screenSender = null;
  document.getElementById('screen-btn').classList.remove('active');
  document.getElementById('screen-btn').innerText = '🖥️ Compartir Pantalla';
  renderStreamCard('local-screen', username + ' (Pantalla)', null, false, 'screen');
  playCustomStreamSound(false);
  sendOffer();
}

function addVideoTrackToConnection(track) {
  if (peerConnection && localStream) {
    return peerConnection.addTrack(track, localStream);
  }
  return null;
}

function removeVideoTrackFromConnection(track) {
  if (!peerConnection || !track) return;
  const sender = peerConnection.getSenders().find(s => s.track && s.track.id === track.id);
  if (sender) {
    sender.track.stop();
    peerConnection.removeTrack(sender);
  }
}

function renderUserCard(id, labelName, avatar, stream = null) {
  const grid = document.getElementById('users-grid');
  if (!grid) return;
  
  let card = document.getElementById('card-' + id);
  const isMe = (id === (socket.id || 'local-user') || labelName.includes('(Tú)'));
  
  if (!card) {
    card = document.createElement('div');
    card.id = 'card-' + id;
    card.className = 'user-card';
    grid.appendChild(card);
  }

  const volumeControlHTML = !isMe ? `
    <div style="position: absolute; top: 8px; left: 8px; z-index: 3;">
      <button onclick="toggleVolumeMenu('${id}')" style="background: rgba(0,0,0,0.6); border: none; color: #fff; padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 12px;" title="Ajustar volumen">🔊</button>
      <div id="vol-menu-${id}" style="display: none; position: absolute; top: 28px; left: 0; background: rgba(30,31,34,0.95); padding: 6px; border-radius: 4px; box-shadow: 0 4px 8px rgba(0,0,0,0.4); align-items: center; gap: 6px;">
        <input type="range" min="0" max="1" step="0.05" value="1" oninput="changeMusicBotVolume(this.value)" title="Volumen Bot" style="width: 70px; accent-color: #5865f2;">
      </div>
    </div>
  ` : '';

  if (stream) {
    card.innerHTML = `
      ${volumeControlHTML}
      <button class="btn-fullscreen" onclick="toggleFullscreen('card-${id}')" title="Pantalla completa">🖵</button>
      <video id="video-${id}" autoplay playsinline muted></video>
      <div class="card-label">${labelName}</div>
    `;
    const videoEl = document.getElementById(`video-${id}`);
    if (videoEl) videoEl.srcObject = stream;
  } else {
    const cleanAvatar = (avatar || '').trim();
    const bgStyle = cleanAvatar ? `background-image: url('${cleanAvatar}');` : '';
    const rawName = labelName ? labelName.replace(' (Tú)', '') : username;
    const initial = rawName ? rawName.charAt(0).toUpperCase() : 'U';
    
    card.innerHTML = `
      ${volumeControlHTML}
      <button class="btn-fullscreen" onclick="toggleFullscreen('card-${id}')" title="Pantalla completa">🖵</button>
      <div class="user-avatar-large" style="${bgStyle}">${cleanAvatar ? '' : initial}</div>
      <div class="card-label">${labelName}</div>
    `;
  }
}

function renderStreamCard(id, labelTitle, stream, isActive, mode = 'camera') {
  const grid = document.getElementById('streams-grid');
  if (!grid) return;
  
  let card = document.getElementById('stream-card-' + id);

  if (!isActive) {
    if (card) card.remove();
    return;
  }

  if (!card) {
    card = document.createElement('div');
    card.id = 'stream-card-' + id;
    card.className = 'stream-card';
    grid.appendChild(card);
  }

  card.innerHTML = `
    <button class="btn-fullscreen" onclick="toggleFullscreen('stream-card-${id}')" title="Pantalla completa">🖵</button>
    <div class="stream-overlay" id="overlay-${id}">
      <span>Canal de: ${labelTitle}</span>
      <div class="stream-overlay-buttons">
        <button class="btn-watch" onclick="watchStreamSource('${id}', '${mode}')">Mirar ${mode === 'camera' ? 'Cámara' : 'Pantalla'}</button>
      </div>
    </div>
    <div class="stream-container">
      <video id="video-stream-${id}" autoplay playsinline></video>
      <div class="stream-controls" id="controls-${id}" style="display:none; align-items: center; gap: 6px;">
        <button class="btn-small btn-danger" onclick="stopWatchingStream('${id}')">Dejar de mirar</button>
        <input type="range" min="500" max="20000" step="500" value="5000" oninput="updateScreenBitrate(this.value)" title="Bitrate" style="accent-color: #5865f2; width: 90px;">
        <button class="btn-small" onclick="toggleStreamVolumeSlider('${id}')" title="Volumen">🔊</button>
        <input type="range" id="vol-slider-${id}" min="0" max="1" step="0.05" value="1" oninput="changeStreamVolume('${id}', this.value)" style="display:none; width: 70px; accent-color: #5865f2;" title="Ajustar volumen">
      </div>
    </div>
    <div class="card-label">${labelTitle}</div>
  `;
  
  const videoEl = document.getElementById(`video-stream-${id}`);
  if (videoEl && stream) videoEl.srcObject = stream;
}

function toggleStreamVolumeSlider(id) {
  const slider = document.getElementById('vol-slider-' + id);
  if (slider) {
    slider.style.display = (slider.style.display === 'none' || slider.style.display === '') ? 'inline-block' : 'none';
  }
}

function toggleVolumeMenu(userId) {
  const menu = document.getElementById('vol-menu-' + userId);
  if (!menu) return;
  menu.style.display = (menu.style.display === 'flex') ? 'none' : 'flex';
}

function watchStreamSource(id, sourceType) {
  const overlay = document.getElementById(`overlay-${id}`);
  const controls = document.getElementById(`controls-${id}`);
  const videoEl = document.getElementById(`video-stream-${id}`);
  
  if (overlay) overlay.style.display = 'none';
  if (controls) controls.style.display = 'flex';
  if (videoEl) {
    videoEl.muted = false;
    videoEl.volume = 1;
    videoEl.play().catch(() => {});
  }
}

function stopWatchingStream(id) {
  const overlay = document.getElementById(`overlay-${id}`);
  const controls = document.getElementById(`controls-${id}`);
  const videoEl = document.getElementById(`video-stream-${id}`);
  
  if (overlay) overlay.style.display = 'flex';
  if (controls) controls.style.display = 'none';
  if (videoEl) {
    videoEl.muted = true;
    videoEl.pause();
  }
}

function changeStreamVolume(id, volumeValue) {
  const card = document.getElementById('stream-card-' + id);
  if (!card) return;
  const mediaElement = card.querySelector('video, audio');
  if (mediaElement) mediaElement.volume = parseFloat(volumeValue);
}

function removeStreamCard(id) {
  const card = document.getElementById('stream-card-' + id);
  if (card) card.remove();
}

function updateScreenBitrate(valueKiloBps) {
  const bitrateVal = document.getElementById('bitrate-val');
  if (bitrateVal) {
    bitrateVal.innerText = (valueKiloBps / 1000).toFixed(1);
  }
  if (screenSender) {
    updateSenderBitrate(screenSender, valueKiloBps * 1000);
  }
}

async function updateSenderBitrate(sender, maxBitrateBps) {
  try {
    const parameters = sender.parameters || sender.getParameters();
    if (!parameters.encodings) {
      parameters.encodings = [{}];
    }
    parameters.encodings[0].maxBitrate = maxBitrateBps;
    await sender.setParameters(parameters);
  } catch (e) {
    console.error('Error al actualizar el bitrate en tiempo real:', e);
  }
}