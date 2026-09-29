const hwToggle = document.getElementById('hardware-accel-toggle');
if (hwToggle) {
  hwToggle.checked = localStorage.getItem('hardware_acceleration') !== 'false';
}

function updateProfileUI() {
  document.getElementById('my-username').innerText = username;
  const avatarEl = document.getElementById('my-avatar');
  
  if (avatarChatUrl) {
    avatarEl.style.backgroundImage = `url('${avatarChatUrl}')`;
    avatarEl.innerText = '';
  } else {
    avatarEl.style.backgroundImage = 'none';
    avatarEl.innerText = username.charAt(0).toUpperCase();
  }
}

function openProfileModal() {
  document.getElementById('input-username').value = username;
  document.getElementById('input-avatar-chat').value = avatarChatUrl;
  document.getElementById('input-avatar-voice').value = avatarVoiceUrl;
  previewAvatars();
  document.getElementById('profile-modal').style.display = 'flex';
}

function closeProfileModal() {
  document.getElementById('profile-modal').style.display = 'none';
}

function previewAvatars() {
  const name = document.getElementById('input-username').value || 'U';
  const chatVal = document.getElementById('input-avatar-chat').value;
  const voiceVal = document.getElementById('input-avatar-voice').value;

  const prevChat = document.getElementById('preview-chat');
  if (chatVal) {
    prevChat.style.backgroundImage = `url('${chatVal}')`;
    prevChat.innerText = '';
  } else {
    prevChat.style.backgroundImage = 'none';
    prevChat.innerText = name.charAt(0).toUpperCase();
  }

  const prevVoice = document.getElementById('preview-voice');
  if (voiceVal) {
    prevVoice.style.backgroundImage = `url('${voiceVal}')`;
    prevVoice.innerText = '';
  } else {
    prevVoice.style.backgroundImage = 'none';
    prevVoice.innerText = name.charAt(0).toUpperCase();
  }
}

function handleFileChat(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('input-avatar-chat').value = e.target.result;
      previewAvatars();
    };
    reader.readAsDataURL(file);
  }
}

function handleFileVoice(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('input-avatar-voice').value = e.target.result;
      previewAvatars();
    };
    reader.readAsDataURL(file);
  }
}

function saveProfile() {
  username = document.getElementById('input-username').value.trim() || username;
  avatarChatUrl = document.getElementById('input-avatar-chat').value.trim();
  avatarVoiceUrl = document.getElementById('input-avatar-voice').value.trim();

  const hwToggle = document.getElementById('hardware-accel-toggle');
  const isHwEnabled = hwToggle ? hwToggle.checked : true;

  localStorage.setItem('discord_username', username);
  localStorage.setItem('discord_avatar_chat', avatarChatUrl);
  localStorage.setItem('discord_avatar_voice', avatarVoiceUrl);
  localStorage.setItem('hardware_acceleration', isHwEnabled);

  updateProfileUI();
  closeProfileModal();

  if (typeof ipcRenderer !== 'undefined' && ipcRenderer.send) {
    ipcRenderer.send('save-hardware-pref', isHwEnabled);
  }
}