import React, { useEffect, useState, useMemo, useCallback } from "react";
import { formatHMS } from "../utils/timeUtils";
import { useSession } from "../context/SessionContext";
import { getTodayReportApi } from "../api/reportApi";
import {
  Activity,
  Brain,
  Heart,
  Clock,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const Dashboard = () => {
  const { employee } = useSession();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    if (!employee?.empId) return;
    try {
      setLoading(true);
      setError("");
      const data = await getTodayReportApi(employee.empId);
      setReport(data && typeof data === "object" ? data : {});
    } catch (err) {
      setError(
        err?.response?.data?.message || "Backend not responding or invalid response."
      );
    } finally {
      setLoading(false);
    }
  }, [employee?.empId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  /* ---------------- SAFE DATA EXTRACTION ---------------- */

  const attendanceStatus = report?.attendanceStatus ?? "Absent";
  const focusScore = Number(report?.focusScore ?? 0);
  // API returns totalLoggedTime (seconds); totalDuration does not exist in this response.
  const totalWorkTime = Number(report?.totalLoggedTime ?? 0);

  // Build a simple activity timeline from today's sessions array (checkpoints are stored per session)
  const activityTimeline = useMemo(() => {
    const sessions = Array.isArray(report?.sessions) ? report.sessions : [];
    return sessions.map((s, i) => ({
      time: s.startTime ? new Date(s.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : `S${i + 1}`,
      activity: s.totalDuration > 0 ? Math.round(((s.activeTime || 0) / s.totalDuration) * 100) : 0,
    }));
  }, [report]);

  const burnoutRisk = useMemo(() => {
    if (focusScore > 75) return "Low";
    if (focusScore > 50) return "Moderate";
    return "High";
  }, [focusScore]);

  /* ---------------- SAFE AI INSIGHTS ---------------- */

  const insights = useMemo(() => {
    const list = [];

    if (focusScore > 80) {
      list.push("Strong focus performance maintained throughout the session.");
    }

    if (focusScore < 50) {
      list.push(
        "Focus levels fluctuated. Consider structured deep-work intervals."
      );
    }

    if (activityTimeline.length > 0) {
      const lowest = activityTimeline.reduce((min, p) =>
        Number(p.activity) < Number(min.activity) ? p : min
      );
      if (lowest?.time) {
        list.push(
          `Activity dipped around ${lowest.time}. That may be a natural reset window.`
        );
      }
    }

    if (!list.length) {
      list.push("Balanced productivity rhythm observed today.");
    }

    return list;
  }, [focusScore, activityTimeline]);

  /* ---------------- LOADING & ERROR ---------------- */

  if (loading)
    return <div style={{ padding: "40px" }}>Loading dashboard...</div>;

  if (error)
    return (
      <div style={{ padding: "40px", color: "red" }}>
        {error}
      </div>
    );

  /* ---------------- ORIGINAL UI (UNCHANGED) ---------------- */

  return (
    <div
      style={{
        padding: "30px 40px",
        width: "100%",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600 }}>Welcome back!</h1>
        <p style={{ color: "#6b7280", marginTop: 6 }}>
          Here's your work wellness overview for today
        </p>
      </div>

      {/* Top Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 20,
          marginBottom: 30,
        }}
      >
        <StatCard
          icon={
            <div
              style={{
                backgroundColor: "#DBEAFE",
                padding: "10px",
                borderRadius: "50%",
                display: "flex",
              }}
            >
              <Activity size={20} color="blue" />
            </div>
          }
          title="Work Session"
          value={attendanceStatus}
          sub={`Worked ${formatHMS(totalWorkTime)}`}
        />

        <StatCard
          icon={
            <div
              style={{
                backgroundColor: "#FFF7ED",
                padding: "10px",
                borderRadius: "50%",
                display: "flex",
              }}
            >
              <Brain size={20} color="#CC7722" />
            </div>
          }
          title="Focus Score"
          value={`${focusScore}%`}
          sub="Active / Total ratio"
        />

        <StatCard
          icon={
            <div
              style={{
                backgroundColor: "#FEE2E2",
                padding: "10px",
                borderRadius: "50%",
                display: "flex",
              }}
            >
              <Heart size={20} color="red" fill="red" />
            </div>
          }
          title="Burnout Risk"
          value={burnoutRisk}
          sub="Based on focus pattern"
        />

        <StatCard
          icon={
            <div
              style={{
                backgroundColor: "#E0F7FA",
                padding: "10px",
                borderRadius: "50%",
                display: "flex",
              }}
            >
              <Clock size={20} color="cyan" />
            </div>
          }
          title="Total Work Time"
          value={formatHMS(totalWorkTime)}
          sub="Today's accumulated time"
        />
      </div>

      {/* Timeline */}
      <div className="wg-card" style={{ padding: 25, marginBottom: 30 }}>
        <h3 style={{ marginBottom: 20 }}>Work Activity Timeline</h3>

        {activityTimeline.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={activityTimeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="activity"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: "center", color: "#9ca3af" }}>
            No activity data available
          </div>
        )}
      </div>

      {/* AI Wellness Section */}
      <div
        style={{
          background: "linear-gradient(135deg, #dcfce7, #bbf7d0)",
          padding: 28,
          borderRadius: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Sparkles size={22} color="#16a34a" />
          <h3 style={{ margin: 0 }}>AI Wellness Insights</h3>
        </div>

        <ul
          style={{
            marginTop: 18,
            paddingLeft: 20,
            lineHeight: 1.9,
          }}
        >
          {insights.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>

        <div
          style={{
            marginTop: 25,
            paddingTop: 15,
            borderTop: "1px solid #a7f3d0",
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#065f46",
            fontSize: 14,
          }}
        >
          <ShieldCheck size={18} />
          <span>
            Your data is processed locally and remains completely private.
          </span>
        </div>
      </div>
    </div>
  );
};

/**  Card Component */
const StatCard = ({ icon, title, value, sub }) => (
  <div className="wg-card" style={{ padding: 20 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {icon}
      <h4 style={{ color: "#6b7280", margin: 0 }}>{title}</h4>
    </div>

    <h2 style={{ marginTop: 15 }}>{value}</h2>
    <p style={{ color: "#6b7280", marginTop: 6 }}>{sub}</p>
  </div>
);

export default Dashboard;
