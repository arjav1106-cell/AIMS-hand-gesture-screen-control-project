/**
 * Preload script - exposes safe APIs to renderer
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Can add window controls here if needed
  closeWindow: () => {
    // Window close handled in main.js
  }
});
