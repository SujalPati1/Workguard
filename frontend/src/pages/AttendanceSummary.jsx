import React, { useEffect, useState } from "react";
import { useSession } from "../context/SessionContext";
import { getTodayReportApi } from "../api/reportApi";

const formatTime = (sec) => {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const AttendanceSummary = () => {
  const { employee } = useSession();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!employee?.empId) return;
      try {
        setLoading(true);
        // Use the correct report API (returns totalDuration, activeTime etc.)
        const res = await getTodayReportApi();
        setData(res);
        setError(null);
      } catch (err) {
        console.error("Failed to load summary:", err);
        setError(err?.response?.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [employee?.empId]);

  if (loading) return <div style={{ padding: 24 }}><p>Loading...</p></div>;
  if (error) return <div style={{ padding: 24, color: "red" }}><p>{error}</p></div>;

  return (
    <div className="summary-container" style={{ padding: 24 }}>
      <h2 className="summary-title" style={{ fontWeight: 800, fontSize: 28, marginBottom: 24, letterSpacing: '-0.02em' }}>Attendance Summary</h2>

      {!data ? (
        <p className="no-data">No data available. Start a session first.</p>
      ) : (
        <>
          {/* Today's Attendance */}
          <div className="wg-card" style={{ padding: 24, marginTop: 16 }}>
            <h3 className="card-heading" style={{ margin: 0, fontWeight: 700, fontSize: 16, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Today's Attendance
            </h3>
            <p className="status-value" style={{ fontSize: 42, fontWeight: 800, margin: "12px 0", color: '#0f172a' }}>
              {data.attendanceStatus ?? "—"}
            </p>
            <p className="status-metrics" style={{ color: "#94a3b8", marginTop: 4, fontSize: 14, fontWeight: 500 }}>
              Sessions today: <span style={{ color: '#475569', fontWeight: 700 }}>{data.sessionCount ?? 0}</span> •{" "}
              Focus Score: <span style={{ color: '#475569', fontWeight: 700 }}>{data.focusScore ?? 0}%</span> •{" "}
              Productivity: <span style={{ color: '#475569', fontWeight: 700 }}>{data.productivityScore ?? 0}%</span>
            </p>
          </div>

          {/* Time Breakdown */}
          <div className="wg-card" style={{ padding: 24, marginTop: 24 }}>
            <h3 className="card-heading" style={{ margin: 0, fontWeight: 700, fontSize: 16, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 20 }}>
              Time Breakdown
            </h3>
            <div className="metrics-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { label: "Total Logged", value: formatTime(data.totalLoggedTime ?? 0) },
                { label: "Active Time", value: formatTime(data.activeTime ?? 0) },
                { label: "Idle Time", value: formatTime(data.idleTime ?? 0) },
                { label: "Break Time", value: formatTime(data.breakTime ?? 0) },
              ].map((item) => (
                <div key={item.label} className="metric-box" style={{ padding: 16, borderRadius: 12, background: "#f8fafc", border: "1px solid #f1f5f9" }}>
                  <p className="metric-label" style={{ margin: 0, fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
                  <p className="metric-value" style={{ margin: "6px 0 0", fontWeight: 800, fontSize: 22, color: '#1e293b' }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Sessions List */}
          <div className="wg-card" style={{ padding: 24, marginTop: 24 }}>
            <h3 className="card-heading" style={{ margin: 0, fontWeight: 700, fontSize: 16, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Sessions</h3>
            <div className="sessions-list" style={{ marginTop: 20, display: "grid", gap: 12 }}>
              {data.sessions && data.sessions.length > 0 ? (
                data.sessions.slice(0, 6).map((s) => (
                  <div
                    key={s._id}
                    className="session-item"
                    style={{
                      padding: 16,
                      borderRadius: 14,
                      background: "#f8fafc",
                      border: "1px solid #f1f5f9",
                    }}
                  >
                    <div className="session-time" style={{ fontWeight: 700, color: '#334155', fontSize: 14 }}>
                      {s.startTime
                        ? new Date(s.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                        : "—"}
                    </div>
                    <p className="session-details" style={{ margin: "8px 0", color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                      Active: {formatTime(s.activeTime || 0)} | Idle:{" "}
                      {formatTime(s.idleTime || 0)} | Break:{" "}
                      {formatTime(s.breakTime || 0)} | Waiting:{" "}
                      {formatTime(s.waitingTime || 0)}
                    </p>
                    <span
                      className="status-pill"
                      style={{
                        display: "inline-block",
                        padding: "4px 12px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        background:
                          s.attendanceStatus === "COMPLETED"
                            ? "#dcfce7"
                            : s.attendanceStatus === "IN_PROGRESS"
                            ? "#dbeafe"
                            : "#fef9c3",
                        color:
                          s.attendanceStatus === "COMPLETED"
                            ? "#15803d"
                            : s.attendanceStatus === "IN_PROGRESS"
                            ? "#1d4ed8"
                            : "#a16207",
                      }}
                    >
                      {s.attendanceStatus ?? "—"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="no-sessions" style={{ color: "#94a3b8", fontSize: 14, fontWeight: 500 }}>No sessions today.</p>
              )}
            </div>
          </div>

          {/* Liveness Compliance */}
          <div className="wg-card" style={{ padding: 24, marginTop: 24 }}>
            <h3 className="card-heading" style={{ margin: 0, fontWeight: 700, fontSize: 16, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 20 }}>
              Liveness Compliance
            </h3>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              {(data.livenessSlots || []).map((slot) => (
                <div
                  key={slot.slotIndex}
                  style={{
                    flex: 1,
                    padding: 16,
                    borderRadius: 12,
                    textAlign: "center",
                    background: slot.status === "PASSED" ? "#dcfce7" : slot.status === "MISSED" ? "#fee2e2" : "#f1f5f9",
                    border: `1px solid ${slot.status === "PASSED" ? "#86efac" : slot.status === "MISSED" ? "#fca5a5" : "#e2e8f0"}`,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>
                    Slot {slot.slotIndex}
                  </p>
                  <p style={{
                    margin: "6px 0 0", fontWeight: 800, fontSize: 16,
                    color: slot.status === "PASSED" ? "#15803d" : slot.status === "MISSED" ? "#b91c1c" : "#64748b",
                  }}>
                    {slot.status === "PASSED" ? "✓ Verified" : slot.status === "MISSED" ? "✗ Missed" : "⏳ Pending"}
                  </p>
                  {slot.completedAt && (
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>
                      {new Date(slot.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#475569' }}>
              Compliance Score: <span style={{
                fontWeight: 800,
                color: (data.complianceScore || 0) >= 100 ? "#15803d" : (data.complianceScore || 0) >= 33 ? "#a16207" : "#b91c1c",
              }}>{data.complianceScore ?? 0}%</span>
            </p>
          </div>

          {/* Burnout & Risk */}
          <div className="wg-card" style={{ padding: 24, marginTop: 24, marginBottom: 40 }}>
            <h3 className="card-heading" style={{ margin: 0, fontWeight: 700, fontSize: 16, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Wellness Snapshot</h3>
            
            {/* Logic synchronization with Dashboard.jsx */}
            {(() => {
              const focusScore = data.focusScore ?? 0;
              let riskLabel = "High";
              let riskColor = "#dc2626";

              if (focusScore > 75) {
                riskLabel = "Low";
                riskColor = "#16a34a";
              } else if (focusScore > 50) {
                riskLabel = "Moderate";
                riskColor = "#ca8a04";
              }

              return (
                <p className="burnout-info" style={{ marginTop: 16, fontSize: 15, fontWeight: 500, color: '#475569' }}>
                  Burnout Risk:{" "}
                  <span
                    className="risk-value"
                    style={{
                      color: riskColor,
                      fontWeight: 800,
                      marginLeft: 8
                    }}
                  >
                    {riskLabel}
                  </span>
                </p>
              );
            })()}

            {data.hasLiveSession && (
              <p className="live-notice" style={{ marginTop: 12, color: "#2563eb", fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb' }}></span>
                A session is currently running.
              </p>
            )}
          </div>
        </>
      )}

      <style>{`
        .summary-container {
          background: #f8fafc;
          min-height: 100vh;
          font-family: 'Inter', system-ui, sans-serif;
        }
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

export default AttendanceSummary;
