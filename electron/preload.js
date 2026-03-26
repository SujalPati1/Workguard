const { ipcRenderer, contextBridge } = require('electron');

// Expose IPC methods to renderer safely when contextIsolation is enabled
contextBridge.exposeInMainWorld('electron', {
  // Auth IPC handlers
  auth: {
    storeTokens: (data) => ipcRenderer.invoke('auth:store-tokens', data),
    getStoredTokens: () => ipcRenderer.invoke('auth:get-stored-tokens'),
    clearTokens: () => ipcRenderer.invoke('auth:clear-tokens'),
  },
  
  // App IPC handlers
  app: {
    getReadyState: () => ipcRenderer.invoke('app:get-ready-state'),
  },
});

// Keep reference to IPC Renderer for backward compatibility
window.ipcRenderer = ipcRenderer;
