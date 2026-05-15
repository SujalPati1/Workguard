// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Auth helpers (legacy compatibility) ───────────────────────────────────
  auth: {
    storeTokens:     (data) => ipcRenderer.invoke('auth:store-tokens', data),
    getStoredTokens: ()     => ipcRenderer.invoke('auth:get-stored-tokens'),
    clearTokens:     ()     => ipcRenderer.invoke('auth:clear-tokens'),
  },

  // ── Engine control ────────────────────────────────────────────────────────
  engine: {
    /** Start the Python engine. withCamera defaults true. */
    start:          (opts)  => ipcRenderer.invoke('engine:start', opts),

    /** Stop the Python engine (session ended). */
    stop:           ()      => ipcRenderer.invoke('engine:stop'),

    /** Ask engine to enable camera for a fresh liveness window. */
    requestLiveness: ()     => ipcRenderer.invoke('engine:request-liveness'),

    /** Notify engine that verification completed; pass keepCamera if needed. */
    livenessDone:   (opts)  => ipcRenderer.invoke('engine:liveness-done', opts),

    /** Explicitly update consent during a session to toggle sensors dynamically. */
    updateConsent:   (payload) => ipcRenderer.invoke('engine:update-consent', payload),

    /** Store session context (sessionId + accessToken) so Electron can auth
     *  server calls when forwarding liveness events. */
    setSessionCtx:  (ctx)   => ipcRenderer.invoke('engine:set-session-ctx', ctx),
  },

  // ── Telemetry stream ──────────────────────────────────────────────────────
  /**
   * Subscribe to real-time biometric telemetry from the Python engine.
   * Returns an unsubscribe function.
   */
  onTelemetry: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('engine-telemetry', handler);
    return () => ipcRenderer.removeListener('engine-telemetry', handler);
  },

  // ── App ready-state ───────────────────────────────────────────────────────
  app: {
    getReadyState: () => ipcRenderer.invoke('app:get-ready-state'),
  },
  
  // ── Native UI / Notifications ─────────────────────────────────────────────
  notification: {
    /** Show a native system notification. */
    show: (opts) => ipcRenderer.invoke('notification:show', opts),
  },
});
