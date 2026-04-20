import React from 'react';
import { useWorkGuardData } from './hooks/useWorkGuardData';
import {
  LineChart, Line, YAxis, XAxis, ResponsiveContainer, Tooltip, Legend
} from 'recharts';
import {
  Eye, Activity, Mic, ShieldCheck, Compass, Brain,
  Monitor, Wind, Zap, AlertTriangle, CheckCircle, Clock
} from 'lucide-react';
import './App.css';

import EvaluationView from './components/EvaluationView';
import { useState } from 'react';

// ─── Tiny reusable components ───────────────────────────────────────────────

function MetricBadge({ label, value, unit = '', warn = false, ok = false }) {
  const color = warn ? '#ef4444' : ok ? '#22c55e' : '#94a3b8';
  return (
    <div className="metric-badge">
      <span className="metric-label">{label}</span>
      <span className="metric-value" style={{ color }}>{value}{unit}</span>
    </div>
  );
}

function BarMeter({ value, max = 100, color = '#3b82f6', label }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="bar-meter">
      {label && <span className="bar-label">{label}</span>}
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="bar-val">{typeof value === 'number' ? value.toFixed(1) : value}</span>
    </div>
  );
}

function StatusPill({ on, labelOn, labelOff, colorOn = '#f97316' }) {
  return (
    <span className="status-pill" style={{ background: on ? colorOn : '#334155', color: '#fff' }}>
      {on ? labelOn : labelOff}
    </span>
  );
}

// ─── Dashboard Component ─────────────────────────────────────────────────────

function DashboardView({ data }) {
  const {
    status, calibrationProgress,
    ear, mar, pitch, yaw, roll,
    isSpeaking, isYawning,
    isLive, livenessScore, livenessStatus,
    appContext, cognitiveMetrics,
    history,
  } = data;

  // Derive status colours
  const statusMeta = (() => {
    if (status === 'Focused')               return { bg: '#14532d', border: '#22c55e', icon: <CheckCircle size={20}/>, text: '#22c55e' };
    if (status === 'Calibrating')           return { bg: '#1e3a5f', border: '#3b82f6', icon: <Clock size={20}/>,       text: '#3b82f6' };
    if (status?.includes('Drowsy'))         return { bg: '#450a0a', border: '#ef4444', icon: <AlertTriangle size={20}/>, text: '#ef4444' };
    if (status?.includes('Distracted'))     return { bg: '#451a03', border: '#f97316', icon: <AlertTriangle size={20}/>, text: '#f97316' };
    return                                         { bg: '#1e293b', border: '#475569', icon: <Activity size={20}/>,    text: '#94a3b8' };
  })();

  const liveColor = isLive ? '#22c55e' : livenessScore > 40 ? '#f97316' : '#ef4444';
  const poseColor = (val, thr = 15) => Math.abs(val) > thr ? '#f97316' : '#94a3b8';

  const kinematic = cognitiveMetrics?.kinematic ?? {};
  const strain    = typeof cognitiveMetrics?.strain_score === 'number' ? cognitiveMetrics.strain_score : null;
  const flowMins  = cognitiveMetrics?.flow_duration_mins ?? 0;
  const needsBreak= cognitiveMetrics?.needs_break ?? false;

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="dash-header">
        <div className="dash-title">
          <Zap size={22} color="#3b82f6" />
          <span>WorkGuard <em>Live Monitor</em></span>
        </div>
        <div
          className="status-hero"
          style={{ background: statusMeta.bg, border: `1.5px solid ${statusMeta.border}`, color: statusMeta.text }}
        >
          {statusMeta.icon}
          <strong>{status || 'Waiting…'}</strong>
        </div>
      </header>

      {/* ── Calibration bar ────────────────────────────────────────────────── */}
      {status === 'Calibrating' && (
        <div className="calib-wrap">
          <span className="calib-text">Calibrating personal baseline… {calibrationProgress}%</span>
          <div className="calib-track">
            <div className="calib-fill" style={{ width: `${calibrationProgress}%` }} />
          </div>
        </div>
      )}

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <Eye size={18} color="#3b82f6" />
            <span>Eye &amp; Mouth</span>
          </div>
          <BarMeter value={ear} max={0.4} color="#3b82f6" label="EAR (openness)" />
          <BarMeter value={mar} max={0.8} color={mar > 0.45 ? '#f97316' : '#8b5cf6'} label="MAR (mouth)" />
          <div className="pill-row">
            <StatusPill on={isYawning} labelOn="😮 Yawning"  labelOff="Mouth OK"  colorOn="#f97316" />
            <StatusPill on={isSpeaking} labelOn="🗣 Speaking" labelOff="Silent"    colorOn="#22c55e" />
          </div>
          <div className="sub-note">
            MAR raw: <strong style={{ color: mar > 0.45 ? '#f97316' : '#94a3b8' }}>{mar.toFixed(3)}</strong>
            &nbsp;| Threshold: 0.45
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <Compass size={18} color="#8b5cf6" />
            <span>Head Pose (3-axis)</span>
          </div>
          <div className="pose-grid">
            <div className="pose-axis">
              <span className="pose-axis-label">PITCH</span>
              <span className="pose-axis-val" style={{ color: poseColor(pitch) }}>{pitch.toFixed(1)}°</span>
              <span className="pose-axis-hint">(up/down)</span>
            </div>
            <div className="pose-axis">
              <span className="pose-axis-label">YAW</span>
              <span className="pose-axis-val" style={{ color: poseColor(yaw) }}>{yaw.toFixed(1)}°</span>
              <span className="pose-axis-hint">(left/right)</span>
            </div>
            <div className="pose-axis">
              <span className="pose-axis-label">ROLL</span>
              <span className="pose-axis-val" style={{ color: poseColor(roll, 20) }}>{roll.toFixed(1)}°</span>
              <span className="pose-axis-hint">(tilt)</span>
            </div>
          </div>
          <div className="sub-note">Alert threshold: ±15° deviation from calibrated baseline</div>
        </div>

        <div className="card">
          <div className="card-head">
            <ShieldCheck size={18} color={liveColor} />
            <span>Liveness Verification</span>
          </div>
          <div className="liveness-score-row">
            <span className="liveness-big" style={{ color: liveColor }}>{livenessScore.toFixed(0)}</span>
            <span className="liveness-unit">/ 100</span>
            <span className="liveness-badge" style={{ background: liveColor }}>{livenessStatus}</span>
          </div>
          <div className="bar-track" style={{ marginTop: 6 }}>
            <div className="bar-fill" style={{ width: `${Math.min(livenessScore, 100)}%`, background: liveColor, transition: 'width 0.3s' }} />
            <div className="liveness-threshold-line" />
          </div>
          <div className="sub-note">Live threshold: 65 pts &nbsp;|&nbsp; Blinks + Sway + Breathing</div>
        </div>

        <div className="card">
          <div className="card-head">
            <Monitor size={18} color="#14b8a6" />
            <span>Active Context</span>
          </div>
          <div className="context-app">{appContext?.base_app || appContext?.process || '—'}</div>
          <div className="context-meta">
            {appContext?.category && <span className="ctx-tag">{appContext.category}</span>}
            {needsBreak && <span className="ctx-tag warn">⏰ Take a Break!</span>}
          </div>
          {strain !== null && (
            <BarMeter
              value={strain * 100} max={100}
              color={strain > 0.5 ? '#ef4444' : strain > 0.3 ? '#f97316' : '#22c55e'}
              label="Cognitive Strain"
            />
          )}
          <div className="sub-note">Flow: <strong>{flowMins} min</strong></div>
        </div>

        {/* ── Card: Kinematic ───────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <Wind size={18} color="#f59e0b" />
            <span>Kinematic Entropy</span>
          </div>
          <div className="metric-grid">
            <MetricBadge label="APM"      value={kinematic.apm ?? 0}           warn={false} />
            <MetricBadge label="Cadence"  value={(kinematic.cadence_variance ?? 0).toFixed(3)} />
            <MetricBadge label="Idle"     value={kinematic.is_idle ? 'Yes' : 'No'} warn={kinematic.is_idle} />
          </div>
          <div className="sub-note">Keyboard + mouse rhythm telemetry</div>
        </div>

        {/* ── Card: Raw Biometrics ──────────────────────────────────────────── */}
        <div className="card">
          <div className="card-head">
            <Brain size={18} color="#a855f7" />
            <span>Raw Signal Values</span>
          </div>
          <div className="metric-grid">
            <MetricBadge label="EAR"   value={ear.toFixed(3)}  />
            <MetricBadge label="MAR"   value={mar.toFixed(3)}  warn={mar > 0.45} />
            <MetricBadge label="Pitch" value={`${pitch.toFixed(1)}°`} warn={Math.abs(pitch) > 15} />
            <MetricBadge label="Yaw"   value={`${yaw.toFixed(1)}°`}  warn={Math.abs(yaw) > 15} />
            <MetricBadge label="Roll"  value={`${roll.toFixed(1)}°`} warn={Math.abs(roll) > 20} />
            <MetricBadge label="Live"  value={isLive ? 'YES' : 'NO'} ok={isLive} warn={!isLive} />
          </div>
        </div>

      </div>{/* end dash-grid */}

      <div className="chart-card">
        <h3 className="chart-title">
          Real-time Signal Stream &nbsp;
          <span style={{ color: '#3b82f6', fontWeight: 400, fontSize: '0.85em' }}>EAR</span>
          &nbsp;/&nbsp;
          <span style={{ color: '#a855f7', fontWeight: 400, fontSize: '0.85em' }}>MAR</span>
        </h3>
        <div className="chart-area">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <XAxis dataKey="time" hide />
              <YAxis domain={[0, 0.6]} hide />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} labelStyle={{ color: '#94a3b8', fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Line type="monotone" dataKey="ear" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} name="EAR" />
              <Line type="monotone" dataKey="mar" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} name="MAR" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const workGuardData = useWorkGuardData();

  return (
    <div className="app-container">
      {/* ── Top Navigation Tabs ───────────────────────────────────────────── */}
      <nav className="top-nav">
        <button 
          className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <Activity size={16}/> Live Dashboard
        </button>
        <button 
          className={`nav-tab ${activeTab === 'eval' ? 'active' : ''}`}
          onClick={() => setActiveTab('eval')}
        >
          <ShieldCheck size={16}/> Model Evaluation
        </button>
      </nav>

      {/* ── Main Scrollable Area ──────────────────────────────────────────── */}
      <div className="dashboard">
        {activeTab === 'dashboard' && <DashboardView data={workGuardData} />}
        {activeTab === 'eval' && <EvaluationView data={workGuardData} />}
      </div>
    </div>
  );
}

export default App;
