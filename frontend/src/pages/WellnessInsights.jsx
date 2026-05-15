import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Scatter,
} from "recharts";
import { useSession } from "../context/SessionContext";
import { getWellnessSessionsApi, getSessionWellnessApi } from "../utils/wellnessApi";

// ─── Constants ───────────────────────────────────────────────────────────────
const EVENT_META = {
  FOCUSED:        { color: "#22c55e", icon: "✅", label: "Focus Streak"      },
  BREAK_RECOVERY: { color: "#10b981", icon: "🔋", label: "Break Recovery"    },
  DROWSY:         { color: "#f59e0b", icon: "😴", label: "Drowsiness"        },
  DISTRACTED:     { color: "#ef4444", icon: "👀", label: "Distracted"        },
  YAWN:           { color: "#f97316", icon: "🥱", label: "Yawn"              },
  BAD_POSTURE:    { color: "#a855f7", icon: "🪑", label: "Poor Posture"      },
  HEARTBEAT:      { color: "#6366f1", icon: "💓", label: "Steady Focus"      },
  SESSION_START:  { color: "#3b82f6", icon: "▶️",  label: "Session Start"     },
  SESSION_END:    { color: "#64748b", icon: "⏹️",  label: "Session End"       },
};

const scoreColor = (score) => {
  if (score === null || score === undefined) return "#94a3b8";
  if (score >= 80) return "#22c55e";
  if (score >= 55) return "#f59e0b";
  return "#ef4444";
};

const scoreGrade = (score) => {
  if (score === null || score === undefined) return "No Data";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 55) return "Fair";
  if (score >= 35) return "Poor";
  return "Needs Attention";
};

const formatDur = (secs) => {
  if (!secs) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d || !d.eventType) return null;
  const meta = EVENT_META[d.eventType] || {};
  return (
    <div style={{
      background: "#0f172a",
      border: "1px solid #1e293b",
      borderRadius: 12,
      padding: "12px 16px",
      fontSize: 13,
      color: "#f1f5f9",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      minWidth: 190,
      pointerEvents: "none",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
        <span>{meta.icon}</span>
        <span>{meta.label || d.eventType}</span>
      </div>
      <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>{d.timeLabel}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: "#94a3b8" }}>Score</span>
        <span style={{ fontWeight: 700, color: scoreColor(d.score) }}>{d.score}</span>
      </div>
      {d.pointsDelta !== 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ color: "#94a3b8" }}>Change</span>
          <span style={{ fontWeight: 700, color: d.pointsDelta > 0 ? "#22c55e" : "#ef4444" }}>
            {d.pointsDelta > 0 ? "+" : ""}{d.pointsDelta} pts
          </span>
        </div>
      )}
      {d.appContext && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed #334155" }}>
          <div style={{ color: "#94a3b8", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Active Application</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{d.appContext.app}</span>
            <span style={{ fontSize: 11, background: "#1e293b", padding: "2px 6px", borderRadius: 4, color: "#cbd5e1" }}>
              {d.appContext.category}
            </span>
          </div>
          <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>
            Segment Duration: {formatDur(d.appContext.duration)}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Custom Dot renderer for the scatter layer ───────────────────────────────
const EventDot = (props) => {
  const { cx, cy, payload } = props;
  if (!cx || !cy) return null;
  if (payload.isVirtual || payload.eventType === "HEARTBEAT") return null;
  const meta = EVENT_META[payload.eventType] || {};
  const color = meta.color || "#2563eb";
  return (
    <g key={`dot-${payload.index}`}>
      {/* Outer glow ring */}
      <circle cx={cx} cy={cy} r={9} fill={color} fillOpacity={0.15} />
      {/* Main dot */}
      <circle cx={cx} cy={cy} r={5} fill={color} stroke="#fff" strokeWidth={2} />
    </g>
  );
};

// ─── Custom Active Dot ────────────────────────────────────────────────────────
const ActiveDot = (props) => {
  const { cx, cy, payload } = props;
  if (!cx || !cy) return null;
  const meta = EVENT_META[payload?.eventType] || {};
  const color = meta.color || "#2563eb";
  return (
    <g>
      <circle cx={cx} cy={cy} r={14} fill={color} fillOpacity={0.12} />
      <circle cx={cx} cy={cy} r={8}  fill={color} stroke="#fff" strokeWidth={2.5} />
    </g>
  );
};

// ─── Reference band label ─────────────────────────────────────────────────────
const BandLabel = ({ viewBox, label, color }) => {
  const { x, y, width } = viewBox || {};
  return (
    <text
      x={(x || 0) + (width || 0) - 6}
      y={(y || 0) - 5}
      fill={color}
      fontSize={10}
      fontWeight={700}
      textAnchor="end"
      fontFamily="system-ui"
      opacity={0.8}
    >
      {label}
    </text>
  );
};

// ─── Wellness Timeline Graph (self-contained, industry-level) ─────────────────
const WellnessTimelineGraph = ({ chartData }) => {
  // ── Normalize data to use sequential index for stable X axis ──────────────
  // Recharts struggles with large epoch timestamps as numeric XAxis keys.
  // We keep the original timestamp for display but plot against index.
  const data = chartData.map((d, i) => ({ ...d, index: i }));

  // Deduce tick positions: pick up to 8 evenly-spaced indices
  const tickIndices = (() => {
    if (data.length <= 1) return [];
    const max = 7;
    const step = Math.max(1, Math.ceil((data.length - 1) / max));
    const ticks = [];
    for (let i = 0; i < data.length; i += step) ticks.push(i);
    if (ticks[ticks.length - 1] !== data.length - 1) ticks.push(data.length - 1);
    return ticks;
  })();

  const scoreMin = Math.max(0, Math.min(...data.map(d => d.score ?? 100)) - 10);

  if (data.length <= 2) {
    return (
      <div style={{
        textAlign: "center", padding: "56px 0",
        background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
        borderRadius: 14, border: "1.5px dashed #cbd5e1",
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#475569", margin: 0 }}>
          Waiting for session data
        </p>
        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
          The graph will populate as the session progresses
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Score summary strip */}
      <div style={{
        display: "flex",
        gap: 6,
        marginBottom: 18,
        padding: "10px 14px",
        background: "linear-gradient(90deg, #f0f9ff, #f8fafc)",
        borderRadius: 10,
        border: "1px solid #e0f2fe",
        flexWrap: "wrap",
        alignItems: "center",
      }}>
        {[
          { label: "Start", score: data[0]?.score },
          { label: "Peak",  score: Math.max(...data.map(d => d.score ?? 0)) },
          { label: "Low",   score: Math.min(...data.map(d => d.score ?? 100)) },
          { label: "Final", score: data[data.length - 1]?.score },
        ].map(({ label, score }) => (
          <div key={label} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 12px",
            borderRadius: 99,
            background: "#fff",
            border: `1px solid ${scoreColor(score)}40`,
            fontSize: 12,
          }}>
            <span style={{ color: "#64748b", fontWeight: 500 }}>{label}</span>
            <span style={{ fontWeight: 800, color: scoreColor(score) }}>{score ?? "—"}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>
          {data.filter(d => !d.isVirtual && d.eventType !== "HEARTBEAT").length} events plotted
        </div>
      </div>

      {/* Main chart */}
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={data}
          margin={{ top: 16, right: 20, left: 0, bottom: 8 }}
        >
          <defs>
            <linearGradient id="wg-scoreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#2563eb" stopOpacity={0.22} />
              <stop offset="60%"  stopColor="#2563eb" stopOpacity={0.06} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="wg-goodZone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#22c55e" stopOpacity={0.06} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
            </linearGradient>
            <filter id="wg-glow">
              <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <CartesianGrid
            strokeDasharray="3 4"
            stroke="#e2e8f0"
            strokeOpacity={0.7}
            vertical={false}
          />

          {/* Good zone band (80–100) */}
          <ReferenceLine
            y={100}
            stroke="transparent"
            fill="url(#wg-goodZone)"
          />
          <ReferenceLine
            y={80}
            stroke="#22c55e"
            strokeDasharray="5 4"
            strokeOpacity={0.5}
            strokeWidth={1.5}
            label={<BandLabel label="Good ≥80" color="#22c55e" />}
          />
          <ReferenceLine
            y={55}
            stroke="#f59e0b"
            strokeDasharray="5 4"
            strokeOpacity={0.5}
            strokeWidth={1.5}
            label={<BandLabel label="Fair ≥55" color="#f59e0b" />}
          />

          <XAxis
            dataKey="index"
            type="number"
            scale="linear"
            domain={[0, data.length - 1]}
            ticks={tickIndices}
            tickFormatter={(idx) => {
              const d = data[idx];
              return d ? d.timeLabel : "";
            }}
            tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 500 }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
            interval="preserveStartEnd"
            allowDataOverflow={false}
          />

          <YAxis
            domain={[Math.max(0, scoreMin), 105]}
            tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            width={34}
            tickCount={6}
          />

          <Tooltip
            content={<CustomTooltip />}
            cursor={{
              stroke: "#2563eb",
              strokeWidth: 1.5,
              strokeDasharray: "4 3",
              strokeOpacity: 0.5,
            }}
          />

          {/* Area fill */}
          <Area
            type="monotoneX"
            dataKey="score"
            stroke="none"
            fill="url(#wg-scoreGrad)"
            isAnimationActive={true}
            animationDuration={900}
            animationEasing="ease-out"
            dot={false}
            activeDot={false}
            connectNulls
          />

          {/* Main line with glow */}
          <Line
            type="monotoneX"
            dataKey="score"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={<EventDot />}
            activeDot={<ActiveDot />}
            isAnimationActive={true}
            animationDuration={900}
            animationEasing="ease-out"
            connectNulls
            style={{ filter: "url(#wg-glow)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{
        display: "flex",
        gap: 14,
        marginTop: 14,
        flexWrap: "wrap",
        padding: "10px 0 2px",
        borderTop: "1px solid #f1f5f9",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b" }}>
          <div style={{ width: 22, borderTop: "2px dashed #22c55e", opacity: 0.7 }} />
          <span>Good (≥80)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b" }}>
          <div style={{ width: 22, borderTop: "2px dashed #f59e0b", opacity: 0.7 }} />
          <span>Fair (≥55)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b" }}>
          <div style={{
            width: 22, height: 3, borderRadius: 2,
            background: "linear-gradient(90deg, #2563eb, #60a5fa)",
          }} />
          <span>Wellness Score</span>
        </div>
        {Object.entries(EVENT_META)
          .filter(([k]) => k !== "HEARTBEAT" && k !== "SESSION_START" && k !== "SESSION_END")
          .map(([key, m]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b" }}>
              <div style={{
                width: 9, height: 9, borderRadius: "50%",
                background: m.color,
                boxShadow: `0 0 4px ${m.color}60`,
              }} />
              <span>{m.label}</span>
            </div>
          ))}
      </div>
    </div>
  );
};

// ─── Score Ring ───────────────────────────────────────────────────────────────
const ScoreRing = ({ score, size = 88 }) => {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#1e293b" strokeWidth={10} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={scoreColor(score)} strokeWidth={10} fill="none"
        strokeDasharray={`${progress} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
};

// ─── Session Card ─────────────────────────────────────────────────────────────
const SessionCard = ({ session, isSelected, onClick }) => {
  const score = session.finalWellnessScore;
  const hasData = score !== null && score !== undefined;
  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? "#f0f7ff" : "#fff",
        border: `2px solid ${isSelected ? "#2563eb" : "#e2e8f0"}`,
        borderRadius: 14, padding: "14px 16px", marginBottom: 10,
        cursor: "pointer",
        transition: "border-color 0.2s, background 0.2s",
        boxShadow: isSelected ? "0 0 0 3px rgba(37,99,235,0.08)" : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
            {session.focusMode ? "🎯 Focus Session" : "💼 Work Session"}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, fontWeight: 500 }}>
            {new Date(session.startTime).toLocaleDateString("en-IN", {
              weekday: "short", day: "numeric", month: "short",
            })} · {formatDur(session.totalDuration)}
          </div>
        </div>
        <div style={{ textAlign: "center", marginLeft: 12 }}>
          <div style={{ position: "relative", width: 48, height: 48 }}>
            <ScoreRing score={hasData ? score : 0} size={48} />
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: hasData ? 11 : 9, fontWeight: 800, color: scoreColor(score) }}>
                {hasData ? score : "N/A"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const WellnessInsights = () => {
  const { employee, sessionWellnessScore, workSessionState } = useSession();
  const [sessions, setSessions]               = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionData, setSessionData]         = useState(null);
  const [loadingSession, setLoadingSession]   = useState(false);

  // ── Fetch session list ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!employee?._id) return;
    setLoadingSessions(true);
    getWellnessSessionsApi(employee._id)
      .then((res) => { if (res?.success) setSessions(res.sessions || []); })
      .catch(() => {})
      .finally(() => setLoadingSessions(false));
  }, [employee?._id]);

  // ── Fetch detail for clicked session ───────────────────────────────────────
  const handleSelectSession = useCallback(async (session) => {
    setSelectedSession(session);
    setSessionData(null);
    setLoadingSession(true);
    try {
      const res = await getSessionWellnessApi(session._id);
      if (res?.success) setSessionData(res);
    } catch (e) {
      console.error("Failed to fetch session wellness:", e);
    } finally {
      setLoadingSession(false);
    }
  }, []);

  // ── Build chart data ────────────────────────────────────────────────────────
  const chartData = (sessionData?.events || []).map((e) => {
    const timestamp = new Date(e.timestamp).getTime();
    let appContext = null;
    if (sessionData?.appUsageTimeline) {
      const segment = sessionData.appUsageTimeline.find(seg => {
        const segStart = new Date(seg.start).getTime();
        const segEnd   = new Date(seg.end).getTime();
        return timestamp >= segStart && timestamp <= segEnd;
      });
      if (segment) appContext = segment;
    }
    
    return {
      timestamp,
      timeLabel:   new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      score:       e.scoreSnapshot,
      eventType:   e.eventType,
      pointsDelta: e.pointsDelta,
      isVirtual:   e.isVirtual || false,
      appContext,
    };
  });

  // console.log(chartData)

  const dataIntegrity   = sessionData?.dataIntegrity;
  const finalScore      = sessionData?.finalWellnessScore;
  const hasFinalData    = finalScore !== null && finalScore !== undefined;

  // ── Insight generation ──────────────────────────────────────────────────────
  const buildInsights = (counts = {}, integrity = null) => {
    const insights = [];
    if (counts.YAWN >= 3)        insights.push({ icon: "🥱", text: `${counts.YAWN} yawn(s) detected. You may be fatigued — consider a 5-min walk or water break.` });
    if (counts.DROWSY >= 2)      insights.push({ icon: "😴", text: `Drowsiness detected ${counts.DROWSY}x. Try stepping outside or splashing cold water on your face.` });
    if (counts.DISTRACTED >= 3)  insights.push({ icon: "👀", text: `${counts.DISTRACTED} distraction events. Consider turning on "Do Not Disturb" or using Focus Mode.` });
    if (counts.FOCUSED >= 2)     insights.push({ icon: "✅", text: `Great work! You sustained ${counts.FOCUSED} consecutive focus streaks. Keep it up!` });
    if (counts.BREAK_RECOVERY)   insights.push({ icon: "🔋", text: `Post-break recovery was strong. Your breaks are working well.` });
    if (counts.BAD_POSTURE >= 2) insights.push({ icon: "🪑", text: `Poor posture detected ${counts.BAD_POSTURE}x. Adjust your chair/monitor height.` });
    if (Object.keys(counts).length === 0) {
      if (integrity && integrity.trackedPercentage < 10) {
        insights.push({ icon: "📷", text: "No biometric events were recorded. The camera was likely off during this session." });
      } else {
        insights.push({ icon: "🎯", text: "Perfect focus maintained! No negative biometric events were recorded while the camera was active." });
      }
    } else if (insights.length === 0) {
      insights.push({ icon: "⭐", text: "Excellent session! No major wellness concerns were detected." });
    }
    return insights;
  };

  const insights       = buildInsights(sessionData?.eventCounts || {}, dataIntegrity);
  const proactiveAlerts = sessionData?.proactiveAlerts || [];

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", padding: 24 }}>

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <h2 style={{ fontWeight: 800, fontSize: 28, margin: 0, marginBottom: 6, letterSpacing: "-0.02em", color: "#0f172a" }}>
        Wellness Insights
      </h2>
      <p style={{ color: "#64748b", margin: "0 0 24px", fontSize: 14, fontWeight: 500 }}>
        Your private biometric health history. This data is never shared with your organization.
      </p>

      {/* ── Live Score Banner ───────────────────────────────────────────── */}
      {workSessionState.running && (
        <div className="wg-card" style={{
          padding: "20px 24px", marginBottom: 24,
          display: "flex", alignItems: "center", gap: 20,
          background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}>
          <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
            <ScoreRing score={sessionWellnessScore} size={64} />
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(sessionWellnessScore) }}>
                {sessionWellnessScore}
              </span>
            </div>
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Live Session Wellness
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
              {sessionWellnessScore} <span style={{ fontSize: 14, color: scoreColor(sessionWellnessScore), fontWeight: 600 }}>— {scoreGrade(sessionWellnessScore)}</span>
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>Resets to 100 at every session start</p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            {Object.entries(EVENT_META).slice(0, 3).map(([key, m]) => (
              <span key={key} style={{
                fontSize: 11, fontWeight: 600, padding: "4px 10px",
                borderRadius: 99, background: "#f1f5f9", color: "#475569",
              }}>{m.icon} {m.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Main Grid ──────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>

        {/* LEFT — Session List */}
        <div>
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Recent Sessions
          </p>
          {loadingSessions ? (
            <div className="wg-card" style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
              Loading sessions…
            </div>
          ) : sessions.length === 0 ? (
            <div className="wg-card" style={{ padding: 32, textAlign: "center", borderRadius: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
              <p style={{ color: "#94a3b8", fontSize: 14, fontWeight: 500, margin: 0 }}>
                No completed sessions yet.<br />Complete a work session to see your wellness history.
              </p>
            </div>
          ) : (
            sessions.map((s) => (
              <SessionCard
                key={s._id}
                session={s}
                isSelected={selectedSession?._id === s._id}
                onClick={() => handleSelectSession(s)}
              />
            ))
          )}
        </div>

        {/* RIGHT — Detail Panel */}
        <div>
          {/* Empty State */}
          {!selectedSession && (
            <div className="wg-card" style={{
              padding: 56, textAlign: "center", borderRadius: 16,
              border: "2px dashed #e2e8f0", background: "#fff",
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
              <p style={{ fontWeight: 700, fontSize: 16, color: "#334155", margin: 0 }}>Select a session</p>
              <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>
                Click any session on the left to view your wellness timeline and insights
              </p>
            </div>
          )}

          {/* Loading */}
          {selectedSession && loadingSession && (
            <div className="wg-card" style={{ padding: 56, textAlign: "center", borderRadius: 16 }}>
              <div style={{ color: "#94a3b8", fontSize: 14 }}>Loading session data…</div>
            </div>
          )}

          {/* Detail View */}
          {selectedSession && !loadingSession && sessionData && (
            <div>

              {/* Session Header Card */}
              <div className="wg-card" style={{ padding: 24, borderRadius: 16, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Session Summary
                    </p>
                    <p style={{ margin: "6px 0 0", fontWeight: 800, fontSize: 20, color: "#0f172a" }}>
                      {new Date(selectedSession.startTime).toLocaleDateString("en-IN", {
                        weekday: "long", day: "numeric", month: "long",
                      })}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b", fontWeight: 500 }}>
                      {formatDur(selectedSession.totalDuration)} · {selectedSession.focusMode ? "🎯 Focus Mode" : "💼 Normal Mode"}
                    </p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ position: "relative", width: 80, height: 80 }}>
                      <ScoreRing score={hasFinalData ? finalScore : 0} size={80} />
                      <div style={{
                        position: "absolute", inset: 0, display: "flex",
                        flexDirection: "column", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{ fontSize: hasFinalData ? 18 : 14, fontWeight: 800, color: scoreColor(finalScore) }}>
                          {hasFinalData ? finalScore : "—"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: scoreColor(finalScore) }}>
                        {scoreGrade(finalScore)}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#94a3b8" }}>Wellness Score</p>
                    </div>
                  </div>
                </div>

                {Object.keys(sessionData.eventCounts || {}).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
                    {Object.entries(sessionData.eventCounts).map(([type, count]) => {
                      const meta = EVENT_META[type] || { color: "#94a3b8", icon: "•", label: type };
                      return (
                        <span key={type} style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "4px 12px", borderRadius: 99, fontSize: 12, fontWeight: 700,
                          background: `${meta.color}18`,
                          color: meta.color,
                          border: `1px solid ${meta.color}40`,
                        }}>
                          {meta.icon} {meta.label} × {count}
                        </span>
                      );
                    })}
                  </div>
                )}

                {dataIntegrity && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "3px 10px",
                      borderRadius: 99, color: dataIntegrity.trackedPercentage >= 80 ? "#16a34a" : "#d97706",
                      background: dataIntegrity.trackedPercentage >= 80 ? "#f0fdf4" : "#fffbeb",
                      border: `1px solid ${dataIntegrity.trackedPercentage >= 80 ? "#bbf7d0" : "#fde68a"}`,
                    }}>
                      📊 {dataIntegrity.trackedPercentage}% Session Tracked
                    </span>
                    {dataIntegrity.gaps?.length > 0 && (
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>
                        ({dataIntegrity.gaps.length} gap{dataIntegrity.gaps.length > 1 ? "s" : ""} detected)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ── Wellness Timeline Graph Card ──────────────────────────── */}
              <div className="wg-card" style={{ padding: 24, borderRadius: 16, marginBottom: 20 }}>
                <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Wellness Timeline
                </p>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8" }}>
                  Score changes over the course of your session. Hover on a point to see the event.
                </p>
                <WellnessTimelineGraph chartData={chartData} />
              </div>

              {/* Proactive Alerts */}
              {proactiveAlerts.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  {proactiveAlerts.map((alert, i) => (
                    <div key={i} style={{
                      padding: "16px 20px", borderRadius: 14, marginBottom: 10,
                      display: "flex", gap: 14, alignItems: "center",
                      background: alert.severity === "high" ? "#fef2f2" : "#fffbeb",
                      border: `1px solid ${alert.severity === "high" ? "#fecaca" : "#fde68a"}`,
                    }}>
                      <span style={{ fontSize: 24 }}>{alert.icon}</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: alert.severity === "high" ? "#dc2626" : "#d97706" }}>
                          {alert.title}
                        </p>
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>{alert.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Insights */}
              <div className="wg-card" style={{ padding: 24, borderRadius: 16 }}>
                <p style={{ margin: "0 0 16px", fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Session Insights
                </p>
                <div style={{ display: "grid", gap: 10 }}>
                  {insights.map((ins, i) => (
                    <div key={i} style={{
                      display: "flex", gap: 12, alignItems: "flex-start",
                      padding: "12px 16px", borderRadius: 12,
                      background: "#f8fafc", border: "1px solid #f1f5f9",
                    }}>
                      <span style={{ fontSize: 18, lineHeight: 1.4 }}>{ins.icon}</span>
                      <span style={{ fontSize: 14, color: "#334155", fontWeight: 500, lineHeight: 1.6 }}>{ins.text}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      <style>{`
        .wg-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
        }
      `}</style>
    </div>
  );
};

export default WellnessInsights;