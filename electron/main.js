const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const zmq = require('zeromq');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess;

// 1. Function to Launch Python
function startPythonEngine() {
  // Point to the Python executable in the venv
  const pythonPath = path.join(__dirname, '../engine/venv/Scripts/python.exe'); // Windows
  // const pythonPath = path.join(__dirname, '../engine/venv/bin/python'); // Mac/Linux
  
  const scriptPath = path.join(__dirname, '../engine/main.py');

  pythonProcess = spawn(pythonPath, [scriptPath]);

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Python]: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Python Error]: ${data}`);
  });
}

// 2. Function to Listen to ZeroMQ
// electron/main.js

async function runZmqReceiver() {
  const sock = new zmq.Subscriber();
  
  sock.connect('tcp://127.0.0.1:5555');
  sock.subscribe(''); 
  console.log('[Electron] Connected to ZMQ');

  for await (const [msg] of sock) {
    const dataString = msg.toString();
    
    // --- ADD THIS LINE TO SEE THE DATA IN TERMINAL ---q
    console.log(`[ZMQ Received]: ${dataString}`); 
    // -------------------------------------------------

    if (mainWindow) {
      mainWindow.webContents.send('python-data', dataString);
    }
  }
}

// 3. Create the Window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For testing only (Enable usually for security)
    },
  });

  // Load the React App (In dev, we load localhost:5173)
  mainWindow.loadURL('http://localhost:5173'); 
}

app.whenReady().then(() => {
  startPythonEngine();
  runZmqReceiver();
  createWindow();
});

// Cleanup on Exit
app.on('will-quit', () => {
  if (pythonProcess) pythonProcess.kill();
});