import { useState, useEffect } from 'react';

/**
 * useWorkGuardData
 * Subscribes to biometric data published by the Python engine over ZeroMQ,
 * forwarded to the renderer via Electron's ipcRenderer.
 *
 * This hook is safe to import in a browser context — it gracefully degrades
 * when ipcRenderer is unavailable (non-Electron environment) by returning
 * all default/zeroed values and never subscribing to any events.
 */

// Guard: only call window.require in a real Electron renderer process.
let ipcRenderer = null;
try {
  if (typeof window !== "undefined" && window.process?.type === "renderer") {
    ipcRenderer = window.require("electron").ipcRenderer;
  }
} catch {
  // Running in a plain browser — ipcRenderer stays null, hook returns defaults.
}

export function useWorkGuardData() {
  // ── Core status ──────────────────────────────────────────────────────────
  const [status, setStatus]                       = useState("Waiting...");
  const [calibrationProgress, setCalibrationProgress] = useState(0);

  // ── Biometrics ───────────────────────────────────────────────────────────
  const [ear, setEar]           = useState(0);
  const [mar, setMar]           = useState(0);
  const [pitch, setPitch]       = useState(0);
  const [yaw, setYaw]           = useState(0);
  const [roll, setRoll]         = useState(0);

  // ── Voice activity ───────────────────────────────────────────────────────
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isYawning, setIsYawning]   = useState(false);

  // ── Liveness ─────────────────────────────────────────────────────────────
  const [isLive, setIsLive]               = useState(false);
  const [livenessScore, setLivenessScore] = useState(0);
  // "Pending" | "Calibrating" | "Warming Up" | "Checking" | "Live"
  const [livenessStatus, setLivenessStatus] = useState("Pending");

  // ── Context & cognitive ──────────────────────────────────────────────────
  const [appContext, setAppContext]         = useState({});
  const [cognitiveMetrics, setCognitiveMetrics] = useState({});

  // ── EAR history for chart ────────────────────────────────────────────────
  const [history, setHistory] = useState([]);

  useEffect(() => {
    // No-op in browser (non-Electron) environments.
    if (!ipcRenderer) return;

    const handler = (_event, dataString) => {
      try {
        const data = JSON.parse(dataString);

        if (data.type !== 'biometrics') return;

        // Core status
        setStatus(data.status ?? "Unknown");
        setCalibrationProgress(data.calibration_progress ?? 0);

        // Biometrics
        setEar(data.ear   ?? 0);
        setMar(data.mar   ?? 0);
        setPitch(data.pitch ?? 0);
        setYaw(data.yaw   ?? 0);
        setRoll(data.roll  ?? 0);

        // Voice activity
        setIsSpeaking(Boolean(data.is_speaking));
        setIsYawning(Boolean(data.is_yawning));

        // Liveness
        setIsLive(Boolean(data.is_live));
        setLivenessScore(data.liveness_score ?? 0);
        setLivenessStatus(data.liveness_status ?? "Pending");

        // Context & cognitive (everything extra main.py adds)
        if (data.app_context !== undefined) setAppContext(data.app_context);

        // Strip known keys; whatever remains are cognitive metrics
        const {
           status: _s, calibration_progress: _cp,
          ear: _ear, mar: _mar, pitch: _p, yaw: _y, roll: _r,
          is_speaking: _is, is_yawning: _iy,
          is_live: _il, liveness_score: _ls, liveness_status: _lst,
          app_context: _ac,
          ...rest
        } = data;
        setCognitiveMetrics(rest);

        // EAR history — last 50 samples
        setHistory(prev => {
          const next = [
            ...prev,
            { time: new Date().toLocaleTimeString(), value: data.ear ?? 0 }
          ];
          return next.length > 50 ? next.slice(-50) : next;
        });

      } catch (e) {
        console.error("useWorkGuardData – parse error:", e);
      }
    };

    ipcRenderer.on('python-data', handler);
    return () => ipcRenderer.removeListener('python-data', handler);
  }, []);

  return {
    // status
    status,
    calibrationProgress,
    // biometrics
    ear, mar, pitch, yaw, roll,
    // voice
    isSpeaking, isYawning,
    // liveness
    isLive, livenessScore, livenessStatus,
    // context
    appContext, cognitiveMetrics,
    // chart
    history,
  };
}