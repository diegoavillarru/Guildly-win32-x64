const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const { autoUpdater } = require('electron-updater'); // <-- Añadido
const path = require('path');
const fs = require('fs');

const configPath = path.join(app.getPath('userData'), 'config.json');

ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({ 
    types: ['window', 'screen'],
    thumbnailSize: { width: 300, height: 200 }
  });

  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL()
  }));
});

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.error('Error leyendo la configuración:', err);
  }
  return { hardwareAcceleration: true };
}

const config = loadConfig();

if (config.hardwareAcceleration === false) {
  app.disableHardwareAcceleration();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      if (sources.length > 0) {
        callback({ video: sources[0] });
      }
    }).catch(err => console.error(err));
  });

  win.loadFile('index.html');
}

ipcMain.on('save-hardware-pref', (event, hardwareAcceleration) => {
  try {
    fs.writeFileSync(configPath, JSON.stringify({ hardwareAcceleration }));
    console.log(`[Configuración] Preferencia guardada (${hardwareAcceleration}). Reiniciando aplicación...`);
    app.relaunch();
    app.exit(0);
  } catch (err) {
    console.error('Error guardando la configuración:', err);
  }
});

app.whenReady().then(() => {
  createWindow();
  
  // Buscar actualizaciones automáticamente al iniciar la app
  autoUpdater.checkForUpdatesAndNotify();
});

// Eventos opcionales para consola
autoUpdater.on('update-available', () => {
  console.log('¡Hay una actualización disponible!');
});

autoUpdater.on('update-downloaded', () => {
  console.log('Actualización descargada. Se instalará al reiniciar.');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});