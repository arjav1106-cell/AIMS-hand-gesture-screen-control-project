/**
 * Focus Layer - Electron Main Process
 * ====================================
 * Creates an always-on-top overlay window that shows:
 * - Right sidebar (gesture list, timer, detected gesture)
 * - Small top bar with single Stop button
 * 
 * Window properties:
 * - Always on top (stays visible when switching apps)
 * - Draggable by top bar (via CSS -webkit-app-region: drag)
 * - Small, compact size
 * - Resizable horizontally for sidebar
 * - Closes cleanly: stops MediaPipe + Desktop Stream via unified endpoint
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

let layerWindow = null;
const API_BASE = 'http://localhost:5000';

function createLayerWindow() {
  layerWindow = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,  // No window frame for overlay look
    alwaysOnTop: true,  // CRITICAL: stays on top when Alt+Tab
    resizable: true,
    skipTaskbar: true,  // Don't show in taskbar
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#0f172a',  // Match dark theme
    transparent: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#e2e8f0'
    }
  });

  // Load the Layer UI HTML
  layerWindow.loadFile('layer.html');

  // When window closes: stop MediaPipe + Desktop Stream via unified endpoint
  // This ensures clean shutdown when user closes the Layer window
  layerWindow.on('closed', () => {
    // Call unified stop endpoint (stops both MediaPipe and Desktop Stream)
    function stopAll() {
      const url = `${API_BASE}/api/focus/stop_all`;
      const req = http.get(url, () => {});
      req.on('error', () => {});  // Ignore errors
      req.setTimeout(1000, () => req.destroy());  // Timeout after 1s
    }
    stopAll();
    layerWindow = null;
  });

  // Prevent window from being minimized (keep it visible)
  layerWindow.on('minimize', (e) => {
    e.preventDefault();
    layerWindow.restore();
  });
}

app.whenReady().then(() => {
  createLayerWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLayerWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On Windows/Linux, quit when all windows closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle second instance: focus existing window instead of creating new one
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (layerWindow) {
      if (layerWindow.isMinimized()) layerWindow.restore();
      layerWindow.focus();
    }
  });
}
