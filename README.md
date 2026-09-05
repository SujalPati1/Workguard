# WorkGuard

## What problem it solves

Remote and hybrid teams are stuck choosing between two bad options for knowing whether someone is actually at work: trust nothing and measure nothing, or install bossware that takes screenshots, logs keystrokes and streams the webcam to a server. WorkGuard is a third option. A Python engine runs on the employee's own machine, reads the webcam at ~30 fps, and turns each frame into a handful of numbers — eye aspect ratio, mouth aspect ratio, head pitch/yaw/roll — which it smooths and reduces to a single status like *Focused*, *Drowsy*, *Distracted* or *Absent*. No video frame ever leaves the laptop; only the derived status and session timings are sent to the server, and only for the signals the employee has consented to. From that, managers get honest attendance and work reports (active time, liveness checks, session history) without ever seeing what's on the person's screen, and the employee gets a private wellness view of their own focus and fatigue patterns that admins cannot read.

## Architecture

```
Python engine (webcam + mic)
        │  ZeroMQ PUB  tcp://127.0.0.1:5555
        ▼
Electron main process  ──IPC──►  React UI (Vite, port 5173)
        │  HTTP
        ▼
Node/Express API (port 5000)  ──►  MongoDB
        ▲
        └── Admin panel (Vite, port 5174)
```

| Folder | What it is |
|---|---|
| `engine/` | Python biometrics engine — MediaPipe face mesh, One-Euro filters, calibration, voice-activity detection |
| `electron/` | Desktop shell; spawns the engine, subscribes to ZeroMQ, relays to the UI and the API |
| `frontend/` | Main React app — login, consent, work session, reports, wellness |
| `server/` | Express + Mongoose API — auth, consent, sessions, daily activity, reports, telemetry |
| `admin/` | Separate React app for the admin/employer view |
| `ui/` | Earlier standalone prototype of the biometrics dashboard |

## How to run it

**Prerequisites:** Node.js 18+, Python 3.10–3.12, a running MongoDB (local or Atlas), and a webcam plus microphone. The Electron shell currently looks for the engine at `engine/venv/Scripts/python.exe`, so on macOS or Linux point that path at `engine/venv/bin/python` in `electron/main.js`.

**1. Set up the Python engine**

```bash
cd engine
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
```

**2. Configure and start the API**

```bash
cd server
npm install
```

Create `server/.env`:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/workguard
JWT_SECRET=replace-me
REFRESH_TOKEN_SECRET=replace-me-too
ADMIN_SECRET=admin-panel-key
# optional tuning
PRESENT_ACTIVE_SECONDS=
PARTIAL_ACTIVE_SECONDS=
LIVENESS_RESPONSE_WINDOW_MS=
```

**3. Install the app dependencies and start everything**

```bash
cd ..                 # repo root
npm install
npm install --prefix frontend
npm run dev
```

`npm run dev` starts the API on `:5000` and Vite on `:5173`, waits for both, then launches the Electron window with the Python engine attached. Sanity check the API on its own with `curl http://localhost:5000/health`.

**4. Admin panel (optional, separate terminal)**

```bash
cd admin
npm install
npm run dev           # http://localhost:5174
```

**First run:** register an employee, accept the consent screen (camera tracking is off by default — turn it on there), then start a work session. The engine spends its first ~3 seconds calibrating your baseline eye aspect ratio, so hold a normal posture and look at the screen until the status leaves *Calibrating*.

## Troubleshooting

- **Status stays `Absent`** — the engine can't see a face. Check the camera isn't held by another app, and that lighting is on your face rather than behind you.
- **Nothing reaches the UI** — look for `[ZMQ Received]` in the Electron DevTools console. If it's missing, the Python process died; its stdout is piped to the same console.
- **CORS errors** — the API only allows `:5173`, `:5174` and `:3000`. If Vite picked a different port, add it to `corsOptions` in `server/server.js`.
