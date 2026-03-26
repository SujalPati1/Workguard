import React, { useEffect, useState } from "react";
import { useSession } from "../context/SessionContext";
import { getSummaryApi } from "../utils/attendanceApi";

const AttendanceSummary = () => {
  const { employee } = useSession();
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!employee?.empId) return;
      const res = await getSummaryApi(employee.empId);
      setData(res);
    };
    load();
  }, [employee]);

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontWeight: 900, fontSize: 26 }}>Attendance Summary</h2>

      {!data ? (
        <p>Loading...</p>
      ) : (
        <>
          <div className="wg-card" style={{ padding: 16, marginTop: 16 }}>
            <h3 style={{ margin: 0, fontWeight: 900 }}>
              ✅ Last 3 Months Attendance
            </h3>
            <p style={{ fontSize: 40, fontWeight: 900, margin: "10px 0" }}>
              {data.attendancePercent}%
            </p>
          </div>

          <div className="wg-card" style={{ padding: 16, marginTop: 16 }}>
            <h3 style={{ margin: 0, fontWeight: 900 }}>Recent Sessions</h3>
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {data.sessions.slice(0, 6).map((s) => (
                <div
                  key={s._id}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.14)",
                  }}
                >
                  <b>{new Date(s.sessionStart).toLocaleString()}</b>
                  <p style={{ margin: "6px 0", opacity: 0.85 }}>
                    Active: {s.activeSeconds}s |
                           Reflection: {s.reflectionSeconds}s |
                     Short Break: {s.shortBreakSeconds}s |
                    Extended Break: {s.extendedBreakSeconds}s |
                    Waiting: {s.waitingSeconds}s
                  </p>
                  {s.outcomeNote && (
                    <p style={{ margin: 0, fontStyle: "italic", opacity: 0.9 }}>
                      “{s.outcomeNote}”
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AttendanceSummary;
