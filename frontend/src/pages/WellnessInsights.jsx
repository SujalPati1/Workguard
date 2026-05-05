import React, { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
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
};

const scoreColor = (score) => {
  if (score >= 80) return "#22c55e";
  if (score >= 55) return "#f59e0b";
  return "#ef4444";
};

const scoreGrade = (score) => {
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
      background: "#0f172a", border: "1px solid #1e293b",
      borderRadius: 12, padding: "12px 16px", fontSize: 13,
      color: "#f1f5f9", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      minWidth: 190,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
        <span>{meta.icon}</span>
        <span>{meta.label}</span>
      </div>
      <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>{d.timeLabel}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: "#94a3b8" }}>Score</span>
        <span style={{ fontWeight: 700, color: scoreColor(d.score) }}>{d.score}</span>
      </div>
      {d.pointsDelta !== 0 && (
        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: 4,
        }}>
          <span style={{ color: "#94a3b8" }}>Change</span>
          <span style={{ fontWeight: 700, color: d.pointsDelta > 0 ? "#22c55e" : "#ef4444" }}>
            {d.pointsDelta > 0 ? "+" : ""}{d.pointsDelta} pts
          </span>
        </div>
      )}
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
  const score = session.finalWellnessScore ?? 100;
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
            <ScoreRing score={score} size={48} />
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: scoreColor(score) }}>
                {score}
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
  const chartData = (sessionData?.events || []).map((e) => ({
    timeLabel:   new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    score:       e.scoreSnapshot,
    eventType:   e.eventType,
    pointsDelta: e.pointsDelta,
  }));

  // ── Insight generation ──────────────────────────────────────────────────────
  const buildInsights = (events = [], counts = {}) => {
    const insights = [];
    if (counts.YAWN >= 3)      insights.push({ icon: "🥱", text: `${counts.YAWN} yawn(s) detected. You may be fatigued — consider a 5-min walk or water break.` });
    if (counts.DROWSY >= 2)    insights.push({ icon: "😴", text: `Drowsiness detected ${counts.DROWSY}x. Try stepping outside or splashing cold water on your face.` });
    if (counts.DISTRACTED >= 3)insights.push({ icon: "👀", text: `${counts.DISTRACTED} distraction events. Consider turning on "Do Not Disturb" or using Focus Mode.` });
    if (counts.FOCUSED >= 2)   insights.push({ icon: "✅", text: `Great work! You sustained ${counts.FOCUSED} consecutive focus streaks. Keep it up!` });
    if (counts.BREAK_RECOVERY) insights.push({ icon: "🔋", text: `Post-break recovery was strong. Your breaks are working well.` });

    // No events at all — camera was off
    if (events.length === 0)   insights.push({ icon: "📷", text: "No biometric events were recorded. The camera may have been off during this session." });

    if (insights.length === 0) insights.push({ icon: "⭐", text: "Excellent session! No wellness concerns were detected." });
    return insights;
  };

  const insights = buildInsights(sessionData?.events, sessionData?.eventCounts || {});
  const finalScore = sessionData?.finalWellnessScore ?? 100;

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", padding: 24 }}>

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <h2 style={{ fontWeight: 800, fontSize: 28, margin: 0, marginBottom: 6, letterSpacing: "-0.02em", color: "#0f172a" }}>
        Wellness Insights
      </h2>
      <p style={{ color: "#64748b", margin: "0 0 24px", fontSize: 14, fontWeight: 500 }}>
        Your private biometric health history. This data is never shared with your organization.
      </p>

      {/* ── Live Score Banner (only when session running) ───────────────── */}
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

                  {/* Score + Grade */}
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ position: "relative", width: 80, height: 80 }}>
                      <ScoreRing score={finalScore} size={80} />
                      <div style={{
                        position: "absolute", inset: 0, display: "flex",
                        flexDirection: "column", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{ fontSize: 18, fontWeight: 800, color: scoreColor(finalScore) }}>
                          {finalScore}
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

                {/* Event count pills */}
                {Object.keys(sessionData.eventCounts || {}).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
                    {Object.entries(sessionData.eventCounts).map(([type, count]) => {
                      const meta = EVENT_META[type] || {};
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
              </div>

              {/* Wellness Timeline Graph */}
              <div className="wg-card" style={{ padding: 24, borderRadius: 16, marginBottom: 20 }}>
                <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Wellness Timeline
                </p>
                <p style={{ margin: "0 0 20px", fontSize: 13, color: "#94a3b8" }}>
                  Score changes over the course of your session. Hover on a point to see the event.
                </p>

                {chartData.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                    <p style={{ fontSize: 14, margin: 0 }}>No biometric events recorded (camera was likely off).</p>
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"   stopColor="#2563eb" stopOpacity={0.15} />
                            <stop offset="95%"  stopColor="#2563eb" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="timeLabel" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                        <YAxis domain={[0, 105]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.6} />
                        <ReferenceLine y={55} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.6} />
                        <Area
                          type="monotone"
                          dataKey="score"
                          stroke="#2563eb"
                          strokeWidth={2.5}
                          fill="url(#scoreGrad)"
                          dot={(props) => {
                            const { cx, cy, payload } = props;
                            const meta = EVENT_META[payload.eventType] || {};
                            return (
                              <circle
                                key={`dot-${payload.timeLabel}`}
                                cx={cx} cy={cy} r={5}
                                fill={meta.color || "#2563eb"}
                                stroke="#fff" strokeWidth={2}
                              />
                            );
                          }}
                          activeDot={{ r: 7, strokeWidth: 2, stroke: "#fff" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>

                    {/* Graph Legend */}
                    <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b" }}>
                        <div style={{ width: 20, borderTop: "2px dashed #22c55e" }} />
                        Good (≥80)
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b" }}>
                        <div style={{ width: 20, borderTop: "2px dashed #f59e0b" }} />
                        Fair (≥55)
                      </div>
                      {Object.entries(EVENT_META).map(([key, m]) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b" }}>
                          <div style={{ width: 9, height: 9, borderRadius: "50%", background: m.color }} />
                          {m.label}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

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

      {/* Shared card styles to match AttendanceSummary */}
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
