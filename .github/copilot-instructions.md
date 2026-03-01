# WorkGuard Codebase Guide for AI Agents

## Architecture Overview

WorkGuard is a **multi-process desktop application** using Electron + Python with ZeroMQ communication:

```
Electron (Node.js) → IPC Bridge → React UI (Vite)
       ↓
  Spawns Python subprocess
       ↓
  Python Engine → ZeroMQ PUB (tcp://127.0.0.1:5555) → Electron ZMQ SUB
```

### Three Major Components

1. **Electron Layer** ([electron/main.js](../electron/main.js))
   - Spawns Python subprocess at `engine/venv/Scripts/python.exe` on Windows (`bin/python` on Mac/Linux)
   - Runs ZeroMQ SUB socket on `tcp://127.0.0.1:5555`, forwards to React via `mainWindow.webContents.send('python-data', dataString)`
   - **Security note**: `contextIsolation: false` is intentionally disabled for dev — do not use `ipcRenderer` directly in production
   - `nodeIntegration: true` is required for `window.require('electron')` in the React hook

2. **Python Engine** ([engine/main.py](../engine/main.py))
   - Single infinite loop at ~30 fps (0.03s sleep). Order each frame: read → `get_biometrics` → 1-Euro Filter → `VoiceActivityDetector` → calibration/status logic → ZMQ publish
   - All signals are filtered **before** status checks — never compare raw values to thresholds
   - ZeroMQ PUB socket sends one JSON object per frame; `type` field always `"biometrics"` (reserved for future message types)

3. **React UI** ([ui/src/App.jsx](../ui/src/App.jsx) + [useWorkGuardData.js](../ui/src/hooks/useWorkGuardData.js))
   - Hook guards on `data.type === 'biometrics'` — add new message types here first before adding state
   - Rolling history of last 50 EAR readings maintained in the hook (not `App`) to avoid propagating re-renders
   - Status states: `"Focused"` `"Drowsy"` `"Distracted (Head Turn)"` `"Calibrating"` `"Absent"`

## Critical Development Workflows

### Running the Project
```bash
npm run dev          # Root: starts Vite (port 5173) + Electron concurrently
npm run electron     # Electron only (requires Vite already running)
npm run dev --prefix ui  # Vite only
```

### Python Environment Setup
```bash
cd engine
python -m venv venv
venv\Scripts\activate          # Windows; use bin/activate on Mac/Linux
pip install -r requirements.txt
```
Key packages: `mediapipe`, `opencv-python`, `pyzmq`, `sounddevice`, `numpy`

### Debugging Cross-Process Communication
- **Python logs** → Electron DevTools console (stdout/stderr piped via `pythonProcess.stdout.on('data', ...)`)
- **ZMQ messages** → search `[ZMQ Received]` in Electron console
- **React data** → Browser DevTools; hook parses JSON and logs `"Parse Error"` on failure
- **Standalone Python test**: run `engine/main.py` directly — prints `PYTHON_ENGINE_STARTED` then camera status

## Biometrics Pipeline (Signal Flow)

Every frame flows through these files in order:

1. [sensors/pipeline.py](../engine/sensors/pipeline.py) — **Two-stage approach**: MediaPipe `FaceDetection` → smart crop with 20% padding → `FaceMesh` on the crop. Landmarks are relative to the **crop**, not the full frame — always pass `crop_w`/`crop_h` to geometry utils.
2. [sensors/camera.py](../engine/sensors/camera.py) — Calls pipeline, then geometry utils; returns a plain dict or `None` if no face detected.
3. [utils/geometry.py](../engine/utils/geometry.py) — Stateless math only. Key MediaPipe landmark indices:
   - `LEFT_EYE = [362, 385, 387, 263, 373, 380]`, `RIGHT_EYE = [33, 160, 158, 133, 153, 144]`
   - Head pose uses `POSE_INDICES = [1, 152, 33, 263, 61, 291]` matched to a generic `FACE_3D` 3D model; focal length approximated as `1 * crop_width`
4. [filters.py](../engine/filters.py) — `OneEuroFilter` per signal. Apply **before** calibration/status. Never share filter instances across signals.
5. [calibration.py](../engine/calibration.py) — Collects 90 EAR frames, removes blink outliers (below 10th percentile), sets `drowsy = baseline × 0.65`, `blink = baseline × 0.75`. Fallback defaults: `drowsy=0.18`, `blink=0.20`.
6. [models/voice_activity.py](../engine/models/voice_activity.py) — MAR-based sliding window detector. Yawn = MAR > `0.42` sustained for 12 frames. Speaking = MAR amplitude + zero-crossing analysis; mutually exclusive with yawning.

## JSON Biometrics Schema

```json
{
  "type": "biometrics",
  "timestamp": 1708958123.45,
  "ear": 0.45,
  "mar": 0.12,
  "pitch": 5.2,
  "yaw": -15.3,
  "roll": 2.1,
  "is_speaking": true,
  "is_yawning": false,
  "status": "Focused",
  "calibration_progress": 100.0
}
```
Values are pre-rounded in Python: 3 decimal places for `ear`/`mar`, 1 for angles.

## Key Configuration & Tuning

| Setting | Location | Value | Effect |
|---|---|---|---|
| EAR/MAR filter | `../engine/main.py:31-32` | `min_cutoff=0.01, beta=20.0` | Smooth steady state, instant blink response |
| Head pose filter | `../engine/main.py:33-35` | `min_cutoff=0.1, beta=10.0` | Less aggressive smoothing |
| Calibration frames | `../engine/main.py:37` | `90` (~3 sec @ 30fps) | Passed to `CalibrationManager` |
| Distraction yaw | `../engine/main.py:88` | `abs(yaw) > 25°` | "Distracted (Head Turn)" trigger |
| Yawn threshold | `../engine/models/voice_activity.py:20` | `mar > 0.42` for 12 frames | Yawning flag |

## How to Add a New Biometric Signal

1. Add the math function to [utils/geometry.py](../engine/utils/geometry.py) (stateless, uses landmark indices)
2. Return the raw value from `get_biometrics()` in [sensors/camera.py](../engine/sensors/camera.py)
3. Add a `OneEuroFilter` instance in [engine/main.py](../engine/main.py) and filter before status logic
4. Add the field to `data_out` dict and include it in the ZMQ JSON
5. Add `useState` + parse in [useWorkGuardData.js](../ui/src/hooks/useWorkGuardData.js) under the `data.type === 'biometrics'` guard
6. Expose from the hook return value and consume in [App.jsx](../ui/src/App.jsx)

## Process & Deployment Notes

- **Python spawn**: `app.whenReady()` → `startPythonEngine()` → `runZmqReceiver()` → `createWindow()`
- **Cleanup**: `app.on('will-quit', ...)` kills Python; ZMQ socket closes automatically
- **React dev URL**: hardcoded `http://localhost:5173` in `createWindow()` — change for production build
- **Cross-platform**: Windows uses `Scripts/python.exe`; Mac/Linux uses `bin/python` (commented alternative in `main.js`)
