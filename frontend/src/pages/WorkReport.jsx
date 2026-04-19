import React, { useEffect, useState, useCallback } from "react";
import { useSession } from "../context/SessionContext.jsx";
import {
  getTodayReportApi,
  getAttendanceSummaryApi,
} from "../api/reportApi.js";

const WorkReport = () => {
  const { employee } = useSession();

  const [report, setReport] = useState(null);
  const [summary, setSummary] = useState(null);

  const [msg, setMsg] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  // ─── Formatters ────────────────────────────────────────────────────────────
  const formatTime = (secs) => {
    const s = Math.max(0, Number(secs) || 0);
    const mins = Math.floor(s / 60);
    const sec = s % 60;
    return `${mins} min ${sec} sec`;
  };

  const formatHHMM = (sec) => {
    const s = Math.max(0, Number(sec) || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  };

  // ─── Load Attendance Summary (last 3 months) ───────────────────────────────
  const loadSummary = useCallback(async () => {
    if (!employee?.empId) return;

    setLoadingSummary(true);
    setMsg("");

    try {
      const data = await getAttendanceSummaryApi(employee.empId, 3);

      if (!data.success) {
        setMsg(data.message || "Failed to load summary");
        setLoadingSummary(false);
        return;
      }

      setSummary(data);
    } catch (err) {
      console.error("Summary load error:", err);
      setMsg(
        err?.response?.data?.message || "Backend not responding (Summary)"
      );
    } finally {
      setLoadingSummary(false);
    }
  }, [employee?.empId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // ─── Generate Today's Report from DB ───────────────────────────────────────
  const generateReport = async () => {
    if (!employee?.empId) {
      setMsg("Please login first");
      return;
    }

    setLoadingReport(true);
    setMsg("Generating report...");

    try {
      const data = await getTodayReportApi(employee.empId);

      if (!data.success) {
        setMsg(data.message || "Error generating report");
        setLoadingReport(false);
        return;
      }

      setReport(data);
      setMsg("Report ready!");
    } catch (err) {
      console.error("Report generate error:", err);
      setMsg(
        err?.response?.data?.message || "Backend not responding (Report)"
      );
    } finally {
      setLoadingReport(false);
    }
  };

  // ─── Download PDF — uses browser's built-in print dialog ──────────────────
  // pdfkit is Node-only and won't work in a browser.
  // window.print() works everywhere and the user can "Save as PDF" from the dialog.
  const downloadPDF = () => {
    if (!report) {
      setMsg("Generate a report first before downloading.");
      return;
    }
    window.print();
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="wg-report-page">
      {/* Header */}
      <div className="wg-report-head">
        <div>
          <h2 className="wg-report-title">Report &amp; Attendance Summary</h2>
          <p className="wg-report-sub">
            Employee generates and shares report only if they want.
          </p>

          <p className="wg-report-emp">
            <b>Logged Employee:</b>{" "}
            {employee
              ? `${employee.fullName || employee.empId} (${employee.empId})`
              : "Not Logged In"}
          </p>
        </div>

        {/* Attendance badge circle */}
        <div className="wg-att-badge-wrap">
          <div className="wg-att-badge">
            {summary ? `${summary.attendancePercent}%` : "--"}
          </div>
          <p className="wg-att-badge-text">Attendance</p>
        </div>
      </div>

      {/* Summary section */}
      <div className="wg-section">
        <div className="wg-section-top">
          <h3 className="wg-section-title">Attendance Summary (Last 3 Months)</h3>

          <button className="wg-btn wg-btn-light" onClick={loadSummary}>
            Refresh
          </button>
        </div>

        {loadingSummary ? (
          <p className="wg-muted">Loading attendance summary...</p>
        ) : !summary ? (
          <p className="wg-muted">
            No summary found yet. Start a session to generate attendance data.
          </p>
        ) : (
          <>
            <div className="wg-summary-grid">
              <div className="wg-card">
                <p className="wg-card-title">Attendance %</p>
                <h2 className="wg-card-big">{summary.attendancePercent}%</h2>
                <p className="wg-card-sub">
                  Based on Active vs Idle (fair model)
                </p>
              </div>

              <div className="wg-card">
                <p className="wg-card-title">Total Active</p>
                <h2 className="wg-card-big">
                  {formatHHMM(summary.totals?.totalActive || 0)}
                </h2>
                <p className="wg-card-sub">Actual working time</p>
              </div>

              <div className="wg-card">
                <p className="wg-card-title">Total Idle</p>
                <h2 className="wg-card-big">
                  {formatHHMM(summary.totals?.totalIdle || 0)}
                </h2>
                <p className="wg-card-sub">Auto-detected inactivity</p>
              </div>

              <div className="wg-card">
                <p className="wg-card-title">Waiting + Break</p>
                <h2 className="wg-card-big">
                  {formatHHMM(
                    (summary.totals?.totalWaiting || 0) +
                      (summary.totals?.totalBreak || 0)
                  )}
                </h2>
                <p className="wg-card-sub">Not punished as idle</p>
              </div>
            </div>

            {/* Recent logs preview */}
            <div className="wg-recent-box">
              <h4 className="wg-recent-title">🗓 Recent Sessions</h4>

              <div className="wg-recent-list">
                {summary.sessions?.slice(0, 4).map((s) => (
                  <div key={s._id} className="wg-recent-item">
                    <div>
                      <b>{new Date(s.sessionStart).toLocaleString()}</b>
                      <p className="wg-muted" style={{ marginTop: 6 }}>
                        Active: {formatHHMM(s.activeSeconds || 0)} • Idle:{" "}
                        {formatHHMM(s.idleSeconds || 0)} • Waiting:{" "}
                        {formatHHMM(s.waitingSeconds || 0)} • Break:{" "}
                        {formatHHMM(s.breakSeconds || 0)}
                      </p>
                      {s.outcomeNote && (
                        <p className="wg-note">"{s.outcomeNote}"</p>
                      )}
                    </div>

                    <div className="wg-pill">
                      {s.attendanceResult || s.workStatus || "WORKING"}
                    </div>
                  </div>
                ))}

                {(!summary.sessions || summary.sessions.length === 0) && (
                  <p className="wg-muted">No sessions in the last 3 months.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Report section */}
      <div className="wg-section">
        <div className="wg-section-top">
          <h3 className="wg-section-title">Today's Work Report</h3>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="wg-btn wg-btn-primary"
              onClick={generateReport}
              disabled={loadingReport}
            >
              {loadingReport ? "Generating..." : "Generate Report"}
            </button>

            <button
              className="wg-btn wg-btn-success"
              onClick={downloadPDF}
              disabled={!report}
            >
              Download PDF
            </button>
          </div>
        </div>

        {msg && <p className="wg-msg">{msg}</p>}

        {report && (
          <div className="wg-report-card">
            <h3>Daily Work Summary</h3>

            <p><b>Date:</b> {report.date}</p>

            <p>
              <b>Session Time:</b>{" "}
              {report.sessionStart
                ? new Date(report.sessionStart).toLocaleTimeString()
                : "—"}{" "}
              -{" "}
              {report.sessionEnd
                ? new Date(report.sessionEnd).toLocaleTimeString()
                : report.hasLiveSession
                ? "In Progress"
                : "—"}
            </p>

            <hr />

            <p><b>Total Logged:</b> {formatTime(report.totalLoggedTime)}</p>
            <p><b>Active:</b> {formatTime(report.activeTime)}</p>
            <p><b>Idle:</b> {formatTime(report.idleTime)}</p>
            <p><b>Focus Mode:</b> {formatTime(report.focusTime)}</p>

            <hr />

            <p><b>Productivity:</b> {report.productivityScore}%</p>
            <p><b>Focus Score:</b> {report.focusScore}%</p>
            <p><b>Burnout Risk:</b> {report.burnoutRisk}</p>
            <p><b>Status:</b> {report.attendanceStatus}</p>
          </div>
        )}
      </div>

      {/* Premium CSS */}
      <style>{`
        .wg-report-page{
          padding: 22px 26px;
          min-height: calc(100vh - 64px);
          background: #f6f7fb;
          font-family: "Times New Roman", Times, serif;
        }

        .wg-report-head{
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:18px;
          margin-bottom: 18px;
        }

        .wg-report-title{
          margin: 0;
          font-size: 30px;
          font-weight: 900;
          color: #0f172a;
        }

        .wg-report-sub{
          margin-top: 8px;
          font-weight: 800;
          color: #16a34a;
        }

        .wg-report-emp{
          margin-top: 8px;
          font-weight: 800;
          color: #334155;
        }

        .wg-att-badge-wrap{
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:8px;
        }

        .wg-att-badge{
          width: 62px;
          height: 62px;
          border-radius: 999px;
          display:flex;
          align-items:center;
          justify-content:center;
          font-weight: 900;
          color: #0b1220;
          background: linear-gradient(135deg, #60a5fa, #a78bfa, #34d399);
          box-shadow: 0 18px 40px rgba(0,0,0,0.18);
          font-size: 14px;
        }

        .wg-att-badge-text{
          margin:0;
          font-weight: 900;
          color: #334155;
          font-size: 13px;
        }

        .wg-section{
          background: rgba(255,255,255,0.96);
          border: 1px solid rgba(15,23,42,0.08);
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 18px 45px rgba(15,23,42,0.08);
          margin-top: 16px;
        }

        .wg-section-top{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
          flex-wrap: wrap;
        }

        .wg-section-title{
          margin: 0;
          font-size: 18px;
          font-weight: 900;
          color: #0f172a;
        }

        .wg-summary-grid{
          margin-top: 14px;
          display:grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .wg-card{
          border-radius: 16px;
          padding: 14px;
          background: rgba(15,23,42,0.04);
          border: 1px solid rgba(15,23,42,0.06);
        }

        .wg-card-title{
          margin: 0;
          font-weight: 900;
          color: #334155;
          font-size: 13px;
        }

        .wg-card-big{
          margin: 8px 0 6px;
          font-weight: 900;
          color: #0f172a;
          font-size: 26px;
        }

        .wg-card-sub{
          margin: 0;
          color: #64748b;
          font-weight: 700;
          font-size: 13px;
        }

        .wg-recent-box{
          margin-top: 14px;
          border-radius: 16px;
          padding: 14px;
          background: rgba(255,255,255,0.7);
          border: 1px solid rgba(15,23,42,0.06);
        }

        .wg-recent-title{
          margin: 0;
          font-weight: 900;
          color: #0f172a;
        }

        .wg-recent-list{
          margin-top: 10px;
          display:grid;
          gap: 10px;
        }

        .wg-recent-item{
          display:flex;
          justify-content:space-between;
          gap:12px;
          padding: 12px;
          border-radius: 14px;
          background: rgba(15,23,42,0.04);
          border: 1px solid rgba(15,23,42,0.06);
        }

        .wg-pill{
          height: fit-content;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(99,102,241,0.12);
          border: 1px solid rgba(99,102,241,0.18);
          font-weight: 900;
          font-size: 12px;
          color: #3730a3;
          white-space: nowrap;
        }

        .wg-note{
          margin: 6px 0 0;
          font-style: italic;
          font-weight: 800;
          color: #0f172a;
        }

        .wg-btn{
          padding: 10px 14px;
          border-radius: 14px;
          border: 1px solid rgba(15,23,42,0.12);
          background: white;
          font-weight: 900;
          cursor:pointer;
        }

        .wg-btn:disabled{
          opacity: 0.5;
          cursor: not-allowed;
        }

        .wg-btn-primary{
          border: none;
          background: linear-gradient(135deg, #60a5fa, #a78bfa, #34d399);
          color: #0b1220;
        }

        .wg-btn-success{
          border: none;
          background: #16a34a;
          color: white;
        }

        .wg-btn-light{
          background: rgba(15,23,42,0.04);
        }

        .wg-msg{
          margin-top: 12px;
          font-weight: 900;
          color: #0f172a;
        }

        .wg-muted{
          margin-top: 10px;
          font-weight: 700;
          color: #64748b;
        }

        .wg-report-card{
          margin-top: 14px;
          padding: 14px;
          border-radius: 16px;
          background: rgba(15,23,42,0.04);
          border: 1px solid rgba(15,23,42,0.06);
          max-width: 520px;
        }

        @media(max-width: 1100px){
          .wg-summary-grid{ grid-template-columns: 1fr 1fr; }
        }

        @media(max-width: 650px){
          .wg-report-head{ flex-direction: column; align-items: flex-start; }
          .wg-summary-grid{ grid-template-columns: 1fr; }
        }

        @media print {
          .wg-btn, .wg-section-top button { display: none !important; }
          .wg-report-page { background: white; padding: 0; }
        }
      `}</style>
    </div>
  );
};

export default WorkReport;
