const { ipcRenderer } = require('electron');
const io = require('socket.io-client');
window.socket = io('https://hypnoses-trunks-twiddling.ngrok-free.dev');
const socket = window.socket; // Para que siga funcionando dentro de jsapp.js sin cambiar el resto

let currentChannel = 'general';
let chatExpanded = true;
let username = localStorage.getItem('discord_username') || ('Usuario_' + Math.floor(Math.random() * 100));
let avatarChatUrl = localStorage.getItem('discord_avatar_chat') || '';
let avatarVoiceUrl = localStorage.getItem('discord_avatar_voice') || '';

// Inicializar reproductor y bot de música
window.syncPlayer = new SyncVideoPlayer(socket);
window.musicBot = new DiscordMusicBot(socket);

socket.on('connect', () => {
  console.log('Conectado exitosamente a Socket.io');
  socket.emit('join-channel', currentChannel);
});

socket.on('chat-history', (msgs) => {
  const box = document.getElementById('messages');
  if (box) {
    box.innerHTML = '';
    msgs.forEach(addMessageToDOM);
  }
});

socket.on('new-message', addMessageToDOM);

async function openScreenModal() {
  const modal = document.getElementById('screenShareModal');
  if (modal) modal.style.display = 'flex';

  const grid = document.getElementById('screenGrid');
  grid.innerHTML = '<p style="color: #b9bbbe; font-size: 13px;">Buscando ventanas y pantallas...</p>';

  try {
    const sources = await ipcRenderer.invoke('get-desktop-sources');
    grid.innerHTML = '';

    sources.forEach(source => {
      const card = document.createElement('div');
      card.className = 'screen-card';
      card.innerHTML = `
        <div style="height: 130px; background: #1e1f22; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
          <img src="${source.thumbnail}" style="width: 100%; height: 100%; object-fit: contain;" />
        </div>
        <span style="font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #dbdee1;">${source.name}</span>
      `;

      card.addEventListener('click', () => {
        startScreenShare(source.id);
      });

      grid.appendChild(card);
    });
  } catch (error) {
    console.error('Error al obtener fuentes de pantalla:', error);
  }
}

async function startScreenShare(sourceId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId
        }
      }
    });

    console.log('Stream de pantalla obtenido:', stream);

    closeScreenModal();
  } catch (err) {
    console.error('No se pudo compartir la pantalla:', err);
  }
}

function toggleChatExpand() {
  chatExpanded = !chatExpanded;
  document.getElementById('messages-container').style.display = chatExpanded ? 'flex' : 'none';
}

function toggleFullscreen(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (!document.fullscreenElement) {
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

function addMessageToDOM(msg) {
  const box = document.getElementById('messages');
  if (!box) return;
  const avatarStyle = msg.avatar ? `background-image: url('${msg.avatar}');` : '';
  const avatarLetter = msg.avatar ? '' : msg.user.charAt(0).toUpperCase();

  box.insertAdjacentHTML('beforeend', `
    <div class="msg-item">
      <div class="avatar-img" style="${avatarStyle}">${avatarLetter}</div>
      <div class="msg-content">
        <div class="msg-header">
          <span class="msg-username">${msg.user}</span>
        </div>
        <div class="msg-text">${msg.text}</div>
      </div>
    </div>
  `);
  box.scrollTop = box.scrollHeight;
}

function sendMsg() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text) return;

  socket.emit('send-message', {
    channel: currentChannel,
    user: username,
    avatar: avatarChatUrl,
    text: text
  });
  input.value = '';
}

function switchChannel(name) {
  currentChannel = name;
  document.getElementById('current-channel').innerText = '# ' + name;
  document.querySelectorAll('#sidebar-top > .channel').forEach(c => {
    if (!c.id.startsWith('vchan-')) c.classList.remove('active');
  });
  document.getElementById('chan-' + name).classList.add('active');
  socket.emit('join-channel', name);
}

function changeMusicBotVolume(value) {
  if (window.musicBot) window.musicBot.setVolume(value);
}

// Inicialización de la UI general al cargar
updateProfileUI();
loadAudioDevices();