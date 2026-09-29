let selectedAudioInputId = localStorage.getItem('discord_audio_input') || '';
let selectedVideoInputId = localStorage.getItem('discord_video_input') || '';

async function loadAudioDevices() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(() => {});
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    const inputSelect = document.getElementById('audio-input');
    inputSelect.innerHTML = '';
    audioInputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Micrófono ${index + 1}`;
      if (device.deviceId === selectedAudioInputId) option.selected = true;
      inputSelect.appendChild(option);
    });

    const videoInputs = devices.filter(d => d.kind === 'videoinput');
    const videoSelect = document.getElementById('video-input');
    videoSelect.innerHTML = '';
    videoInputs.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Cámara ${index + 1}`;
      if (device.deviceId === selectedVideoInputId) option.selected = true;
      videoSelect.appendChild(option);
    });

    const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
    const outputSelect = document.getElementById('audio-output');
    outputSelect.innerHTML = '';
    audioOutputs.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Altavoz (${device.deviceId.slice(0, 5)}...)`;
      outputSelect.appendChild(option);
    });
  } catch (err) {
    console.error('Error dispositivos:', err);
  }
}

function changeAudioInput(deviceId) {
  selectedAudioInputId = deviceId;
  localStorage.setItem('discord_audio_input', deviceId);
}

function changeVideoInput(deviceId) {
  selectedVideoInputId = deviceId;
  localStorage.setItem('discord_video_input', deviceId);
  if (isCameraActive) {
    toggleCamera();
    toggleCamera();
  }
}

async function changeAudioOutput(deviceId) {
  document.querySelectorAll('audio[id^="remote-audio"]').forEach(async (audioEl) => {
    if (typeof audioEl.setSinkId === 'function') {
      try { await audioEl.setSinkId(deviceId); } catch (e) {}
    }
  });
}

function getAudioContext() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(type, startFreq, endFreq, duration, gainValue = 0.05) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    gainNode.gain.setValueAtTime(gainValue, now);
    gainNode.gain.linearRampToValueAtTime(0.01, now + (duration * 0.8));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {}
}

function playCustomConnectSound() {
  playTone('sine', 300, 750, 0.2, 0.01);
}

function playCustomDisconnectSound() {
  playTone('sine', 500, 200, 0.18, 0.08);
}

function playCustomClickSound(isMuting) {
  playTone('triangle', isMuting ? 350 : 600, isMuting ? 200 : 800, 0.08, 0.05);
}

function playCustomCameraSound(isVideoOn) {
  playTone('sine', isVideoOn ? 800 : 400, isVideoOn ? 1200 : 250, 0.1, 0.03);
}

function playCustomStreamSound(isStreaming) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'triangle';
    if (isStreaming) {
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.setValueAtTime(659.25, now + 0.08);
      osc1.frequency.setValueAtTime(783.99, now + 0.16);
    } else {
      osc1.frequency.setValueAtTime(783.99, now);
      osc1.frequency.setValueAtTime(523.25, now + 0.1);
    }

    const duration = isStreaming ? 0.28 : 0.2;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.01, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc1.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + duration);
  } catch (e) {}
}

function playCustomErrorSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.setValueAtTime(140, now + 0.1);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.03, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  } catch (e) {}
}