const { app, BrowserWindow, ipcMain, Menu, session } = require('electron');
const path = require('node:path');

// Native desktop GPU / WebGPU / Vulkan performance flags
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
if (process.platform === 'linux' || process.platform === 'win32') {
  app.commandLine.appendSwitch('enable-features', 'Vulkan');
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createMainWindow() {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'Operation: Ironclad',
    backgroundColor: '#0b0e12',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // Allow pointer lock and fullscreen inside the standalone desktop executable
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'pointerLock' || permission === 'fullscreen') {
      callback(true);
      return;
    }
    callback(false);
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      (input.key === 'F11' || (input.alt && input.key === 'Enter'))
    ) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });

  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow = win;
  win.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('desktop:quit', () => {
  app.quit();
});

ipcMain.handle('desktop:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle('desktop:is-fullscreen', () => {
  return mainWindow ? mainWindow.isFullScreen() : false;
});

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
