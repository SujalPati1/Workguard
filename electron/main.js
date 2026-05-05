// electron/main.js
const { app, BrowserWindow, ipcMain, net } = require('electron');
const path = require('path');
const zmq = require('zeromq');
const { spawn } = require('child_process');
const http = require('http');

// ─────────────────────────────────────────────────────────────────────────────
// PREVENT APP SLEEP / TIMER THROTTLING
// ─────────────────────────────────────────────────────────────────────────────
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
let mainWindow = null;
let pythonProcess = null;
let zmqPubSock = null;   // SUB — listens to engine telemetry
let zmqCmdSock = null;   // PUSH — sends commands to engine

// Track whether a liveness confirmation has already been forwarded to the
// server for the current verification window so we don't double-post.
let livenessFiredThisWindow = false;

// ─────────────────────────────────────────────────────────────────────────────
// SERVER BASE URL (same as .env on server side — keep in sync)
// ─────────────────────────────────────────────────────────────────────────────
const SERVER_BASE = 'http://localhost:5000';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Fire-and-forget POST to the Node.js server. */
function postToServer(endpoint, body, accessToken) {
  const payload = JSON.stringify(body);
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: endpoint,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  };

  const req = http.request(options, (res) => {
    console.log(`[Electron→Server] POST ${endpoint} → ${res.statusCode}`);
  });
  req.on('error', (e) => console.error(`[Electron→Server] Error posting ${endpoint}:`, e.message));
  req.write(payload);
  req.end();
}

// ─────────────────────────────────────────────────────────────────────────────
// PYTHON ENGINE LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

function startPythonEngine(withCamera = true, withTracking = true) {
  if (pythonProcess) {
    console.log('[Electron] Engine already running — skipping spawn.');
    return;
  }

  const pythonPath = path.join(__dirname, '../engine/venv/Scripts/python.exe');
  const scriptPath = path.join(__dirname, '../engine/main.py');

  const args = [scriptPath];
  if (!withCamera) args.push('--no-camera');
  if (!withTracking) args.push('--no-tracking');

  pythonProcess = spawn(pythonPath, args);

  pythonProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    console.log(`[Python]: ${msg}`);
    if (msg.includes('PYTHON_ENGINE_STARTED')) {
      console.log('[Electron] Engine confirmed started.');
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Python Error]: ${data}`);
  });

  pythonProcess.on('exit', (code) => {
    console.log(`[Electron] Python engine exited with code ${code}`);
    pythonProcess = null;
  });
}

function stopPythonEngine() {
  if (!pythonProcess) return;
  // Send graceful shutdown command first
  sendEngineCommand({ action: 'shutdown' });
  setTimeout(() => {
    if (pythonProcess) {
      pythonProcess.kill();
      pythonProcess = null;
    }
  }, 1500);
}

// ─────────────────────────────────────────────────────────────────────────────
// ZMQ SOCKETS
// ─────────────────────────────────────────────────────────────────────────────

/** Send a JSON command to the Python engine via the PUSH/PULL channel. */
function sendEngineCommand(cmdObj) {
  if (!zmqCmdSock) return;
  zmqCmdSock.send(JSON.stringify(cmdObj)).catch((e) =>
    console.error('[Electron] ZMQ CMD send error:', e)
  );
}

async function setupZmqSockets() {
  // Command socket (PUSH → engine PULL on 5556)
  zmqCmdSock = new zmq.Push();
  await zmqCmdSock.connect('tcp://127.0.0.1:5556');

  // Telemetry subscriber (SUB ← engine PUB on 5555)
  zmqPubSock = new zmq.Subscriber();
  zmqPubSock.connect('tcp://127.0.0.1:5555');
  zmqPubSock.subscribe('');
  console.log('[Electron] ZMQ sockets ready.');

  // Forward telemetry to React renderer + handle liveness events
  for await (const [msg] of zmqPubSock) {
    try {
      const data = JSON.parse(msg.toString());

      // ── Push raw telemetry to React (for status indicators etc.) ──────────
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('engine-telemetry', data);
      }

      // ── Liveness confirmed → forward to server once per window ────────────
      if (data.is_live === true && !livenessFiredThisWindow) {
        livenessFiredThisWindow = true;

        // Read the current session context stored by the renderer via IPC
        const ctx = global.currentSessionCtx || {};
        if (ctx.empId && ctx.accessToken && ctx.currentLivenessSlot) {
          postToServer(
            '/api/telemetry/liveness',
            {
              empId: ctx.empId,
              slotIndex: ctx.currentLivenessSlot,
              livenessScore: data.liveness_score,
              timestamp: data.timestamp,
            },
            ctx.accessToken
          );
          console.log(`[Electron] Liveness slot ${ctx.currentLivenessSlot} confirmed → forwarded to server.`);
        }
      }
    } catch (e) {
      console.error('[Electron] ZMQ parse error:', e);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC HANDLERS  (called by React via preload.js)
// ─────────────────────────────────────────────────────────────────────────────

/** React tells us a session has started — spin up the engine. */
ipcMain.handle('engine:start', (_evt, { withCamera = true, withTracking = true } = {}) => {
  livenessFiredThisWindow = false;
  startPythonEngine(withCamera, withTracking);
  return { ok: true };
});

/** React tells us the session has ended — kill the engine. */
ipcMain.handle('engine:stop', () => {
  stopPythonEngine();
  return { ok: true };
});

/** React requests a fresh liveness window. */
ipcMain.handle('engine:request-liveness', () => {
  livenessFiredThisWindow = false;   // allow next confirmation to fire
  if (!pythonProcess) {
    console.log('[Electron] Engine is off. Starting engine for liveness...');
    // Start with camera enabled, but no tracking (since this is just a liveness check)
    startPythonEngine(true, false);
  } else {
    console.log('[Electron] Engine already running. Enabling camera...');
    sendEngineCommand({ action: 'enable_camera' });
  }
  return { ok: true };
});

/** React tells us verification is done — turn camera off and optionally stop engine. */
ipcMain.handle('engine:liveness-done', (_evt, { keepCamera = false } = {}) => {
  if (!keepCamera) {
    sendEngineCommand({ action: 'disable_camera' });
  }
  // Always reset so the next slot can post to server
  livenessFiredThisWindow = false;
  return { ok: true };
});

/** Explicitly update consent during an active session. */
ipcMain.handle('engine:update-consent', (_evt, payload) => {
  sendEngineCommand({ action: 'update_consent', payload });
  return { ok: true };
});

/** React stores the current session context so Electron can auth server calls. */
ipcMain.handle('engine:set-session-ctx', (_evt, ctx) => {
  global.currentSessionCtx = ctx;
  return { ok: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW
// ─────────────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL('http://localhost:5173');

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─────────────────────────────────────────────────────────────────────────────
// APP LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();
  // Sockets must be set up AFTER the app is ready so the async loop runs
  // inside the Electron event loop correctly.
  setupZmqSockets().catch((e) => console.error('[Electron] ZMQ setup error:', e));
  // NOTE: Engine is NOT auto-started here.
  // It is started on-demand when the user begins a session (engine:start IPC).
});

let isQuitting = false;

app.on('before-quit', (e) => {
  if (isQuitting) return;

  if (global.currentSessionCtx && global.currentSessionCtx.sessionId && global.currentSessionCtx.accessToken) {
    e.preventDefault();
    console.log("[Electron] Stopping active session before quit...");

    try {
      const request = net.request({
        method: 'POST',
        url: 'http://localhost:5000/attendance/stop',
      });
      request.setHeader('Content-Type', 'application/json');
      request.setHeader('Authorization', `Bearer ${global.currentSessionCtx.accessToken}`);

      request.on('response', (response) => {
        console.log("[Electron] Session closed on server, status:", response.statusCode);
        isQuitting = true;
        app.quit();
      });

      request.on('error', (err) => {
        console.error("[Electron] Session close failed:", err);
        isQuitting = true;
        app.quit();
      });

      request.write(JSON.stringify({ sessionId: global.currentSessionCtx.sessionId }));
      request.end();
    } catch (err) {
      console.error("[Electron] Exception during quit:", err);
      isQuitting = true;
      app.quit();
    }
  }
});

app.on('will-quit', () => {
  stopPythonEngine();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});