import React from 'react';
import { useWorkGuardData } from './hooks/useWorkGuardData';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';
import { Eye, Activity, Mic, ShieldCheck, Compass, Brain, Monitor } from 'lucide-react';
import './App.css';

function App() {
  const {
    // status
    status, calibrationProgress,
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
  } = useWorkGuardData();

  // ── Status card ──────────────────────────────────────────────────────────
  const getStatusColor = () => {
    if (status === 'Focused')                return 'bg-green-100 text-green-800 border-green-500';
    if (status === 'Calibrating')            return 'bg-blue-100 text-blue-800 border-blue-500';
    if (status.includes('Drowsy'))           return 'bg-red-100 text-red-800 border-red-500';
    if (status.includes('Distracted'))       return 'bg-yellow-100 text-yellow-800 border-yellow-500';
    return 'bg-gray-100 text-gray-800 border-gray-500';
  };

  // ── Voice label ──────────────────────────────────────────────────────────
  const getVoiceLabel = () => {
    if (isYawning)  return 'Yawning';
    if (isSpeaking) return 'Speaking';
    return 'Silent';
  };
  const getVoiceColor = () => {
    if (isYawning)  return 'text-orange-600';
    if (isSpeaking) return 'text-green-600';
    return 'text-gray-600';
  };

  // ── Liveness ─────────────────────────────────────────────────────────────
  const getLivenessColor = () => (isLive ? 'live-true' : 'live-false');

  // ── Head-pose colour coding ───────────────────────────────────────────────
  const headPoseColor = (val, threshold = 20) =>
    Math.abs(val) > threshold ? 'text-yellow-600 font-bold' : 'text-gray-700';

  return (
    <div className="app-container">

      <h1 className="title">
        WorkGuard <span className="subtitle">Live Architecture V1</span>
      </h1>

      {/* ── Calibration progress bar (only shown while calibrating) ────── */}
      {status === 'Calibrating' && (
        <div className="calibration-bar-wrapper">
          <p className="calibration-label">Calibrating… {calibrationProgress}%</p>
          <div className="calibration-track">
            <div
              className="calibration-fill"
              style={{ width: `${calibrationProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid-layout">

        {/* Card 1 – Current State */}
        <div className={`p-6 rounded-xl border-l-4 shadow-sm ${getStatusColor()}`}>
          <div className="flex items-center space-x-4">
            <Activity className="w-8 h-8" />
            <div>
              <p className="text-sm uppercase font-bold opacity-70">Current State</p>
              <h2 className="text-2xl font-bold">{status}</h2>
            </div>
          </div>
        </div>

        {/* Card 2 – EAR */}
        <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center space-x-4 text-blue-600">
            <Eye className="w-8 h-8" />
            <div>
              <p className="text-sm uppercase font-bold text-gray-400">Eye Openness (EAR)</p>
              <h2 className="text-2xl font-bold">{ear.toFixed(3)}</h2>
              <p className="text-xs text-gray-400 mt-1">MAR: {mar.toFixed(3)}</p>
            </div>
          </div>
        </div>

        {/* Card 3 – Voice Activity */}
        <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className={`flex items-center space-x-4 ${getVoiceColor()}`}>
            <Mic className="w-8 h-8" />
            <div>
              <p className="text-sm uppercase font-bold text-gray-400">Voice Activity</p>
              <h2 className="text-xl font-bold">{getVoiceLabel()}</h2>
            </div>
          </div>
        </div>

        {/* Card 4 – Liveness */}
        <div className={`p-6 bg-white rounded-xl border border-gray-200 shadow-sm ${getLivenessColor()}`}>
          <div className="flex items-center space-x-4">
            <ShieldCheck className="w-8 h-8" />
            <div>
              <p className="text-sm uppercase font-bold text-gray-400">Liveness Verification</p>
              {/* Uses liveness_status string from main.py directly */}
              <h2 className="text-xl font-bold">{livenessStatus}</h2>
              <p className="text-sm opacity-70 mt-1">Score: {livenessScore.toFixed(1)}</p>
            </div>
          </div>
          <div className="liveness-bar">
            <div
              className="liveness-fill"
              style={{ width: `${Math.min(livenessScore, 100)}%` }}
            />
          </div>
        </div>

        {/* Card 5 – Head Pose (pitch / yaw / roll from main.py) */}
        <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center space-x-4 text-indigo-600">
            <Compass className="w-8 h-8" />
            <div>
              <p className="text-sm uppercase font-bold text-gray-400">Head Pose</p>
              <div className="flex gap-4 mt-1 text-sm">
                <span className={headPoseColor(pitch)}>
                  Pitch&nbsp;<strong>{pitch.toFixed(1)}°</strong>
                </span>
                <span className={headPoseColor(yaw, 25)}>
                  Yaw&nbsp;<strong>{yaw.toFixed(1)}°</strong>
                </span>
                <span className={headPoseColor(roll)}>
                  Roll&nbsp;<strong>{roll.toFixed(1)}°</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 6 – App Context (from context_poller) */}
        <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center space-x-4 text-teal-600">
            <Monitor className="w-8 h-8" />
            <div>
              <p className="text-sm uppercase font-bold text-gray-400">Active Context</p>
              <h2 className="text-lg font-bold truncate max-w-xs">
                {appContext?.title || appContext?.app || 'Unknown'}
              </h2>
              {appContext?.category && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Category: {appContext.category}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Card 7 – Cognitive Metrics (whatever cognitive_tracker adds) */}
        {Object.keys(cognitiveMetrics).length > 0 && (
          <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm col-span-2">
            <div className="flex items-start space-x-4 text-purple-600">
              <Brain className="w-8 h-8 mt-1 flex-shrink-0" />
              <div className="w-full">
                <p className="text-sm uppercase font-bold text-gray-400 mb-2">
                  Cognitive Metrics
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(cognitiveMetrics).map(([key, val]) => (
                    <div key={key} className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-xs text-gray-500 capitalize">
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm font-bold text-gray-800">
                        {typeof val === 'number' ? val.toFixed(2) : String(val)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── EAR chart ──────────────────────────────────────────────────────── */}
      <div className="chart-card">
        <h3 className="chart-title">Real-time Attention Tensor (EAR)</h3>
        <div className="chart-area">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <YAxis domain={[0.15, 0.35]} hide />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                strokeWidth={3}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}

export default App;