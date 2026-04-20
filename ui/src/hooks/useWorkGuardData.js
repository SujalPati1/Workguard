import { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

export function useWorkGuardData() {
  // ── Core status ──────────────────────────────────────────────────────────
  const [status, setStatus]                           = useState("Waiting...");
  const [calibrationProgress, setCalibrationProgress] = useState(0);

  // ── Biometrics ───────────────────────────────────────────────────────────
  const [ear, setEar]     = useState(0);
  const [mar, setMar]     = useState(0);
  const [pitch, setPitch] = useState(0);
  const [yaw, setYaw]     = useState(0);
  const [roll, setRoll]   = useState(0);

  // ── Voice activity ───────────────────────────────────────────────────────
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isYawning, setIsYawning]   = useState(false);

  // ── Liveness ─────────────────────────────────────────────────────────────
  const [isLive, setIsLive]               = useState(false);
  const [livenessScore, setLivenessScore] = useState(0);
  const [livenessStatus, setLivenessStatus] = useState("Pending");

  // ── Context & cognitive ──────────────────────────────────────────────────
  const [appContext, setAppContext]           = useState({});
  const [cognitiveMetrics, setCognitiveMetrics] = useState({});

  // ── Dual-chart history (EAR + MAR, last 60 samples) ──────────────────────
  const [history, setHistory] = useState([]);

  useEffect(() => {
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

        // Context & cognitive
        if (data.app_context !== undefined) setAppContext(data.app_context);

        // Strip all known top-level keys; remainder = cognitive/kinematic metrics
        const {
          status: _s, calibration_progress: _cp, type: _t, timestamp: _ts,
          ear: _ear, mar: _mar, pitch: _p, yaw: _y, roll: _r,
          is_speaking: _is, is_yawning: _iy,
          is_live: _il, liveness_score: _ls, liveness_status: _lst,
          app_context: _ac,
          ...rest
        } = data;
        setCognitiveMetrics(rest);

        // Dual-chart history — last 60 samples with both EAR and MAR
        setHistory(prev => {
          const next = [
            ...prev,
            {
              time: new Date().toLocaleTimeString(),
              ear:  data.ear ?? 0,
              mar:  data.mar ?? 0,
            }
          ];
          return next.length > 60 ? next.slice(-60) : next;
        });

      } catch (e) {
        console.error("useWorkGuardData – parse error:", e);
      }
    };

    ipcRenderer.on('python-data', handler);
    return () => ipcRenderer.removeListener('python-data', handler);
  }, []);

  return {
    status, calibrationProgress,
    ear, mar, pitch, yaw, roll,
    isSpeaking, isYawning,
    isLive, livenessScore, livenessStatus,
    appContext, cognitiveMetrics,
    history,
  };
}
