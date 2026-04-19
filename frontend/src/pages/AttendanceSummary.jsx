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
        const res = await getTodayReportApi(employee.empId);
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
    <div style={{ padding: 24 }}>
      <h2 style={{ fontWeight: 900, fontSize: 26 }}>Attendance Summary</h2>

      {!data ? (
        <p>No data available. Start a session first.</p>
      ) : (
        <>
          {/* Today's Attendance */}
          <div className="wg-card" style={{ padding: 16, marginTop: 16 }}>
            <h3 style={{ margin: 0, fontWeight: 900 }}>
              ✅ Today's Attendance
            </h3>
            <p style={{ fontSize: 40, fontWeight: 900, margin: "10px 0" }}>
              {data.attendanceStatus ?? "—"}
            </p>
            <p style={{ color: "#64748b", marginTop: 4 }}>
              Sessions today: {data.sessionCount ?? 0} •{" "}
              Focus Score: {data.focusScore ?? 0}% •{" "}
              Productivity: {data.productivityScore ?? 0}%
            </p>
          </div>

          {/* Time Breakdown */}
          <div className="wg-card" style={{ padding: 16, marginTop: 16 }}>
            <h3 style={{ margin: 0, fontWeight: 900, marginBottom: 12 }}>
              ⏱ Time Breakdown
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "Total Logged", value: formatTime(data.totalLoggedTime ?? 0) },
                { label: "Active Time", value: formatTime(data.activeTime ?? 0) },
                { label: "Idle Time", value: formatTime(data.idleTime ?? 0) },
                { label: "Break Time", value: formatTime(data.breakTime ?? 0) },
              ].map((item) => (
                <div key={item.label} style={{ padding: 12, borderRadius: 12, background: "rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.06)" }}>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b", fontWeight: 700 }}>{item.label}</p>
                  <p style={{ margin: "4px 0 0", fontWeight: 900, fontSize: 20 }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Sessions List */}
          <div className="wg-card" style={{ padding: 16, marginTop: 16 }}>
            <h3 style={{ margin: 0, fontWeight: 900 }}>Recent Sessions</h3>
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {data.sessions && data.sessions.length > 0 ? (
                data.sessions.slice(0, 6).map((s) => (
                  <div
                    key={s._id}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      background: "rgba(15,23,42,0.04)",
                      border: "1px solid rgba(15,23,42,0.06)",
                    }}
                  >
                    <b>
                      {s.startTime
                        ? new Date(s.startTime).toLocaleString()
                        : "—"}
                    </b>
                    <p style={{ margin: "6px 0", color: "#475569", fontSize: 13 }}>
                      Active: {formatTime(s.activeTime || 0)} | Idle:{" "}
                      {formatTime(s.idleTime || 0)} | Break:{" "}
                      {formatTime(s.breakTime || 0)} | Waiting:{" "}
                      {formatTime(s.waitingTime || 0)}
                    </p>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        background:
                          s.attendanceResult === "PRESENT"
                            ? "#dcfce7"
                            : s.attendanceResult === "PARTIAL"
                            ? "#fef9c3"
                            : "#fee2e2",
                        color:
                          s.attendanceResult === "PRESENT"
                            ? "#16a34a"
                            : s.attendanceResult === "PARTIAL"
                            ? "#ca8a04"
                            : "#dc2626",
                      }}
                    >
                      {s.attendanceResult ?? "—"}
                    </span>
                  </div>
                ))
              ) : (
                <p style={{ color: "#64748b" }}>No sessions today.</p>
              )}
            </div>
          </div>

          {/* Burnout & Risk */}
          <div className="wg-card" style={{ padding: 16, marginTop: 16 }}>
            <h3 style={{ margin: 0, fontWeight: 900 }}>Wellness Snapshot</h3>
            <p style={{ marginTop: 10 }}>
              <b>Burnout Risk:</b>{" "}
              <span
                style={{
                  color:
                    data.burnoutRisk === "HIGH"
                      ? "#dc2626"
                      : data.burnoutRisk === "MEDIUM"
                      ? "#ca8a04"
                      : "#16a34a",
                  fontWeight: 700,
                }}
              >
                {data.burnoutRisk ?? "—"}
              </span>
            </p>
            {data.hasLiveSession && (
              <p style={{ marginTop: 6, color: "#2563eb", fontWeight: 700 }}>
                🔴 A session is currently running.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AttendanceSummary;
