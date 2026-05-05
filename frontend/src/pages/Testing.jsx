// frontend/src/pages/Testing.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Real-time Engine Debugger & Integration Test Panel
// – Shows every field the Python engine emits over ZMQ
// – Lets you manually trigger liveness, enable/disable camera
// – Shows session timer state from SessionContext
// – Works like the ui/ folder test pages but inside the real app
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import { useSession } from "../context/SessionContext";

const isElectron = () => typeof window !== "undefined" && !!window.electronAPI;

// ── Small helpers ─────────────────────────────────────────────────────────────
const Pill = ({ label, value, color = "#0ea5e9" }) => (
  <div style={{ ...pillStyle, borderColor: color }}>
    <span style={{ color: "#94a3b8", fontSize: 11 }}>{label}</span>
    <span style={{ color, fontWeight: 700, fontSize: 14 }}>{value ?? "—"}</span>
  </div>
);

const Section = ({ title, children }) => (
  <div style={sectionStyle}>
    <div style={sectionTitleStyle}>{title}</div>
    {children}
  </div>
);

const Btn = ({ label, onClick, color = "#3b82f6", disabled = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      padding: "9px 18px",
      borderRadius: 10,
      border: "none",
      background: disabled ? "#1e293b" : color,
      color: disabled ? "#475569" : "#fff",
      fontWeight: 600,
      fontSize: 13,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "0.2s",
    }}
  >
    {label}
  </button>
);

// ── Main component ─────────────────────────────────────────────────────────────
const Testing = () => {
  const {
    engineTelemetry,
    workSessionState,
    triggerLivenessModal,
    startEngineForSession,
    stopWorkSession,
    livenessChecksDone,
    currentLivenessSlot,
  } = useSession();

  const [log, setLog]         = useState([]);
  const [paused, setPaused]   = useState(false);
  const pausedRef             = useRef(false);
  const logRef                = useRef([]);

  // ── Mirror log from live telemetry ───────────────────────────────────────
  useEffect(() => {
    if (!engineTelemetry || pausedRef.current) return;
    const entry = {
      t: new Date().toLocaleTimeString(),
      status:         engineTelemetry.status,
      liveness_score: engineTelemetry.liveness_score,
      liveness_status:engineTelemetry.liveness_status,
      is_live:        engineTelemetry.is_live,
      ear:            engineTelemetry.ear,
      mar:            engineTelemetry.mar,
      pitch:          engineTelemetry.pitch,
      yaw:            engineTelemetry.yaw,
      camera:         engineTelemetry.camera_enabled,
    };
    const next = [entry, ...logRef.current].slice(0, 60);
    logRef.current = next;
    setLog([...next]);
  }, [engineTelemetry]);

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  const { running, sessionId, activeSec, idleSec, waitingSec, breakSec } = workSessionState;

  // Derived checks
  const engineRunning = !!engineTelemetry;
  const camEnabled    = engineTelemetry?.camera_enabled;

  const fmt = (s = 0) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  };

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={titleStyle}>🧪 Engine Test Console</h1>
        <p style={{ color: "#64748b", marginTop: 4 }}>
          Real-time biometric telemetry debugger &amp; integration test panel
        </p>
      </div>

      {/* Status row */}
      <div style={rowStyle}>
        <Section title="Engine State">
          <div style={pillRowStyle}>
            <Pill label="Engine" value={engineRunning ? "🟢 Running" : "🔴 Stopped"} color={engineRunning ? "#22c55e" : "#ef4444"} />
            <Pill label="Camera" value={camEnabled ? "📷 ON" : "📷 OFF"} color={camEnabled ? "#f59e0b" : "#475569"} />
            <Pill label="Session" value={running ? "▶ Active" : "■ Idle"} color={running ? "#3b82f6" : "#475569"} />
            <Pill label="Session ID" value={sessionId ? sessionId.slice(-8) : "none"} />
          </div>
        </Section>

        <Section title="Session Timers">
          <div style={pillRowStyle}>
            <Pill label="Active"  value={fmt(activeSec)}  color="#22c55e" />
            <Pill label="Idle"    value={fmt(idleSec)}    color="#ef4444" />
            <Pill label="Waiting" value={fmt(waitingSec)} color="#f59e0b" />
            <Pill label="Break"   value={fmt(breakSec)}   color="#8b5cf6" />
          </div>
        </Section>
      </div>

      {/* Live biometrics */}
      <Section title="Live Biometrics (from Engine)">
        <div style={pillRowStyle}>
          <Pill label="Status"         value={engineTelemetry?.status          ?? "—"} color="#e2e8f0" />
          <Pill label="Liveness Score" value={engineTelemetry?.liveness_score  ?? "—"} color="#0ea5e9" />
          <Pill label="Liveness State" value={engineTelemetry?.liveness_status ?? "—"} color="#a78bfa" />
          <Pill label="Is Live"        value={engineTelemetry?.is_live ? "✅ YES" : "❌ NO"} color={engineTelemetry?.is_live ? "#22c55e" : "#ef4444"} />
          <Pill label="EAR (eye)"      value={engineTelemetry?.ear ?? "—"}  color="#94a3b8" />
          <Pill label="MAR (mouth)"    value={engineTelemetry?.mar ?? "—"}  color="#94a3b8" />
          <Pill label="Pitch"          value={engineTelemetry?.pitch ?? "—"} color="#94a3b8" />
          <Pill label="Yaw"            value={engineTelemetry?.yaw ?? "—"}  color="#94a3b8" />
          <Pill label="Roll"           value={engineTelemetry?.roll ?? "—"} color="#94a3b8" />
          <Pill label="Speaking"       value={engineTelemetry?.is_speaking ? "Yes" : "No"} />
          <Pill label="Yawning"        value={engineTelemetry?.is_yawning  ? "Yes" : "No"} />
          <Pill label="Verified ×"     value={livenessChecksDone} color="#f59e0b" />
        </div>
      </Section>

      {/* App context */}
      <Section title="App Context & Cognitive State (from Engine)">
        <div style={pillRowStyle}>
          <Pill label="Base App"    value={engineTelemetry?.app_context?.base_app     ?? "—"} />
          <Pill label="Process"     value={engineTelemetry?.app_context?.process      ?? "—"} />
          <Pill label="Category"    value={engineTelemetry?.app_context?.category     ?? "—"} />
          <Pill label="Focus Score" value={engineTelemetry?.focus_score               ?? "—"} color="#22c55e" />
        </div>
      </Section>

      {/* Kinematics */}
      <Section title="Kinematics & Input (from Engine)">
        <div style={pillRowStyle}>
          <Pill label="APM (Actions/Min)" value={engineTelemetry?.kinematic?.apm ?? "—"} color="#3b82f6" />
          <Pill label="Cadence Variance"  value={engineTelemetry?.kinematic?.cadence_variance ?? "—"} color="#a78bfa" />
          <Pill label="Kinematic Idle"    value={engineTelemetry?.kinematic?.is_idle ? "Yes" : "No"} color={engineTelemetry?.kinematic?.is_idle ? "#ef4444" : "#22c55e"} />
        </div>
      </Section>

      {/* Control buttons */}
      <Section title="Controls">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {/* Only available when no session and Electron present */}
          <Btn
            label="▶ Start Engine (no session)"
            color="#3b82f6"
            disabled={!isElectron() || engineRunning}
            onClick={() => {
              if (isElectron()) window.electronAPI.engine.start({ withCamera: false });
            }}
          />
          <Btn
            label="⏹ Stop Engine"
            color="#ef4444"
            disabled={!isElectron() || !engineRunning}
            onClick={() => { if (isElectron()) window.electronAPI.engine.stop(); }}
          />
          <Btn
            label={`🔐 Trigger Liveness (Slot ${currentLivenessSlot || '?'})`}
            color="#8b5cf6"
            disabled={!running}
            onClick={() => triggerLivenessModal(currentLivenessSlot)}
          />
          <Btn
            label="📷 Enable Camera"
            color="#f59e0b"
            disabled={!isElectron() || camEnabled}
            onClick={() => { if (isElectron()) window.electronAPI.engine.requestLiveness(); }}
          />
          <Btn
            label="📷 Disable Camera"
            color="#475569"
            disabled={!isElectron() || !camEnabled}
            onClick={() => { if (isElectron()) window.electronAPI.engine.livenessDone({ keepCamera: false }); }}
          />
          <Btn
            label={paused ? "▶ Resume Log" : "⏸ Pause Log"}
            color="#0ea5e9"
            onClick={togglePause}
          />
          <Btn
            label="🗑 Clear Log"
            color="#475569"
            onClick={() => { logRef.current = []; setLog([]); }}
          />
        </div>
      </Section>

      {/* Telemetry Log */}
      <Section title={`Telemetry Log (last 60 frames) — ${paused ? "PAUSED" : "LIVE"}`}>
        <div style={logBoxStyle}>
          {log.length === 0 && (
            <div style={{ color: "#475569", padding: 12 }}>
              {engineRunning ? "Waiting for frames…" : "Engine not running. Start a session or click 'Start Engine' above."}
            </div>
          )}
          {log.map((entry, i) => (
            <div key={i} style={{ ...logRowStyle, opacity: i === 0 ? 1 : 0.65 - i * 0.008 }}>
              <span style={{ color: "#475569", width: 80, flexShrink: 0 }}>{entry.t}</span>
              <span style={{ color: statusColor(entry.status), width: 120 }}>{entry.status}</span>
              <span style={{ color: "#0ea5e9", width: 80 }}>liv:{entry.liveness_score}</span>
              <span style={{ color: entry.is_live ? "#22c55e" : "#ef4444", width: 70 }}>
                {entry.is_live ? "✅ live" : "❌"}
              </span>
              <span style={{ color: "#94a3b8" }}>
                ear:{entry.ear} mar:{entry.mar} P:{entry.pitch} Y:{entry.yaw}
              </span>
              <span style={{ color: entry.camera ? "#f59e0b" : "#475569", marginLeft: "auto" }}>
                📷{entry.camera ? "ON" : "off"}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Raw JSON dump */}
      <Section title="Raw Telemetry Packet (last frame)">
        <pre style={preStyle}>
          {engineTelemetry ? JSON.stringify(engineTelemetry, null, 2) : "No data yet"}
        </pre>
      </Section>
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const statusColor = (s) => {
  if (!s) return "#475569";
  if (s === "Focused") return "#22c55e";
  if (s === "Drowsy")  return "#f59e0b";
  if (s === "Distracted (Head Turn)") return "#ef4444";
  if (s === "Absent")  return "#ef4444";
  if (s === "Calibrating") return "#a78bfa";
  return "#94a3b8";
};

// ── Styles ─────────────────────────────────────────────────────────────────────
const pageStyle = {
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
  background: "#0f172a",
  minHeight: "100vh",
  color: "#e2e8f0",
  padding: "32px 36px",
};

const titleStyle = {
  fontSize: 26,
  fontWeight: 800,
  color: "#f1f5f9",
  margin: 0,
};

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  marginBottom: 16,
};

const sectionStyle = {
  background: "#1e293b",
  borderRadius: 16,
  padding: 20,
  border: "1px solid #334155",
  marginBottom: 16,
};

const sectionTitleStyle = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 14,
};

const pillRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const pillStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  padding: "8px 14px",
  borderRadius: 10,
  background: "#0f172a",
  border: "1px solid #334155",
  minWidth: 90,
};

const logBoxStyle = {
  background: "#0a0f1e",
  borderRadius: 10,
  padding: 12,
  maxHeight: 320,
  overflowY: "auto",
  fontFamily: "monospace",
  fontSize: 12,
};

const logRowStyle = {
  display: "flex",
  gap: 12,
  padding: "4px 0",
  borderBottom: "1px solid #0f172a",
};

const preStyle = {
  background: "#0a0f1e",
  color: "#94a3b8",
  borderRadius: 10,
  padding: 16,
  fontSize: 12,
  overflowX: "auto",
  maxHeight: 300,
  overflowY: "auto",
  fontFamily: "monospace",
};

export default Testing;
