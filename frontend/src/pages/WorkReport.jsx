import React, { useEffect, useState, useCallback } from "react";
import { useSession } from "../context/SessionContext.jsx";
import {
  getTodayReportApi,
  getAttendanceSummaryApi,
} from "../api/reportApi.js";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}h ${m}m ${sec}s` : `${m} min ${sec} sec`;
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
      const data = await getAttendanceSummaryApi(3);

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
      const data = await getTodayReportApi();

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

  // ─── Download PDF — Uses jsPDF for a structured document ──────────────────
  const downloadPDF = async () => {
    console.log("Download button clicked. Report:", report);
    if (!report || !employee) {
      setMsg("Generate a report first before downloading.");
      return;
    }

    try {
      console.log("Initializing jsPDF...");
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;

      // 1. Header & Title
      doc.setFontSize(22);
      doc.setTextColor(37, 99, 235); // Blue
      doc.text("WORKGUARD", 15, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text("Professional Work Activity Report", 15, 26);
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 15, 26, { align: "right" });

      doc.setDrawColor(200);
      doc.line(15, 30, pageWidth - 15, 30);

      // 2. Employee Info
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.setFont("helvetica", "bold");
      doc.text("Employee Information", 15, 42);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Name: ${employee.fullName || "N/A"}`, 15, 48);
      doc.text(`Employee ID: ${employee.empId}`, 15, 53);
      doc.text(`Report Date: ${report.date}`, 15, 58);

      // 3. Performance Summary
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Performance Metrics", 15, 72);

      const metrics = [
        ["Total Logged", formatTime(report.totalLoggedTime)],
        ["Active Time", formatTime(report.activeTime)],
        ["Idle Time", formatTime(report.idleTime)],
        ["Productivity Score", `${report.productivityScore}%`],
        ["Focus Score", `${report.focusScore}%`],
        ["Burnout Risk", report.burnoutRisk || "Low"]
      ];

      autoTable(doc, {
        startY: 76,
        head: [["Metric", "Value"]],
        body: metrics,
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 10, cellPadding: 4 }
      });

      // 4. Session History (Today's sessions only)
      if (report && report.sessions && report.sessions.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Today's Session Breakdown", 15, doc.lastAutoTable.finalY + 15);

        const sessionData = report.sessions.map(s => [
          new Date(s.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          formatTime(s.activeTime || 0),
          formatTime(s.idleTime || 0),
          `${s.productivityIndex || 0}%`,
          s.workStatus || "WORKING"
        ]);

        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 20,
          head: [["Time", "Active", "Idle", "Productivity", "Status"]],
          body: sessionData,
          theme: "grid",
          headStyles: { fillColor: [71, 85, 105] },
          styles: { fontSize: 9 }
        });
      }

      // 4.5 Top Applications Used (if available)
      if (report.appUsageSummary && report.appUsageSummary.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Top Applications Used", 15, doc.lastAutoTable.finalY + 15);

        const appData = report.appUsageSummary.slice(0, 15).map(app => [
          app.app,
          formatTime(app.duration)
        ]);

        autoTable(doc, {
          startY: doc.lastAutoTable.finalY + 20,
          head: [["Application", "Duration"]],
          body: appData,
          theme: "grid",
          headStyles: { fillColor: [14, 165, 233] }, // light blue
          styles: { fontSize: 9 }
        });
      }

      // 5. Footer
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          "This report is an automated summary of digital activity and wellness metrics provided by WorkGuard.",
          pageWidth / 2,
          doc.internal.pageSize.height - 10,
          { align: "center" }
        );
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - 15, doc.internal.pageSize.height - 10, { align: "right" });
      }

      doc.save(`WorkGuard_Report_${employee.empId}_${report.date}.pdf`);
      setMsg("Report downloaded successfully.");
    } catch (err) {
      console.error("PDF generation error:", err);
      setMsg(`Error generating PDF: ${err.message}`);
    }
  };

  // ─── Frontend Aggregation ──────────────────────────────────────────────────
  const getAggregatedData = () => {
    if (!summary || !summary.dailyBreakdown) return null;
    
    let totalActive = 0;
    let totalIdle = 0;
    let totalWaiting = 0;
    let totalBreak = 0;
    let presentCount = 0;
    let partialCount = 0;

    summary.dailyBreakdown.forEach(day => {
      totalActive += (day.totalActive || 0);
      totalIdle += (day.totalIdle || 0);
      totalWaiting += (day.totalWaiting || 0);
      totalBreak += (day.totalBreak || 0);
      if (day.result === "PRESENT") presentCount++;
      if (day.result === "PARTIAL") partialCount++;
    });

    const totalDays = summary.dailyBreakdown.length;
    const computedAttendance = totalDays > 0 
      ? Math.round(((presentCount + partialCount * 0.5) / totalDays) * 100) 
      : 0;

    // Prepare chart data (last 14 days, reversed so oldest is first)
    const chartData = summary.dailyBreakdown.slice(0, 14).reverse().map(d => ({
      date: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      Active: Math.round((d.totalActive || 0) / 3600 * 10) / 10,
      Idle: Math.round((d.totalIdle || 0) / 3600 * 10) / 10
    }));

    return { totalActive, totalIdle, totalWaiting, totalBreak, computedAttendance, chartData };
  };

  const aggData = getAggregatedData();

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
            {aggData ? `${aggData.computedAttendance}%` : "--"}
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
                <h2 className="wg-card-big">{aggData.computedAttendance}%</h2>
                <p className="wg-card-sub">
                  Based on Liveness & Time
                </p>
              </div>

              <div className="wg-card">
                <p className="wg-card-title">Total Active</p>
                <h2 className="wg-card-big">
                  {formatHHMM(aggData.totalActive)}
                </h2>
                <p className="wg-card-sub">Actual working time</p>
              </div>

              <div className="wg-card">
                <p className="wg-card-title">Total Idle</p>
                <h2 className="wg-card-big">
                  {formatHHMM(aggData.totalIdle)}
                </h2>
                <p className="wg-card-sub">Auto-detected inactivity</p>
              </div>

              <div className="wg-card">
                <p className="wg-card-title">Waiting + Break</p>
                <h2 className="wg-card-big">
                  {formatHHMM(aggData.totalWaiting + aggData.totalBreak)}
                </h2>
                <p className="wg-card-sub">Not punished as idle</p>
              </div>
            </div>

            {/* Historical Chart */}
            <div className="wg-recent-box">
              <h4 className="wg-recent-title">Active vs Idle Trend (Last 14 Days)</h4>
              <div style={{ width: "100%", height: 280, marginTop: "20px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={aggData.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorIdle" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '8px' }}
                    />
                    <Area type="monotone" dataKey="Active" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorActive)" />
                    <Area type="monotone" dataKey="Idle" stroke="#94a3b8" strokeWidth={3} fillOpacity={1} fill="url(#colorIdle)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent logs preview */}
            <div className="wg-recent-box">
              <h4 className="wg-recent-title">Recent Sessions</h4>

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
                      {s.workStatus || "WORKING"}
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
          <h3 className="wg-section-title">Daily Work Report</h3>

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
          <div className="wg-report-dashboard">
            <div className="wg-report-header-card">
              <div>
                <h4 className="wg-report-date">{new Date(report.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h4>
                <p className="wg-report-time-range">
                  {report.sessionStart ? new Date(report.sessionStart).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "—"} 
                  {" "}to{" "} 
                  {report.sessionEnd ? new Date(report.sessionEnd).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : report.hasLiveSession ? "In Progress" : "—"}
                </p>
              </div>
              <div className={`wg-report-status-badge ${report.attendanceStatus}`}>
                {report.attendanceStatus}
              </div>
            </div>

            <div className="wg-report-metrics-grid">
              <div className="wg-metric-card">
                <span className="wg-metric-icon" style={{background: "#e0e7ff", color: "#4f46e5"}}>⏱️</span>
                <div>
                  <p className="wg-metric-label">Total Logged Time</p>
                  <h3 className="wg-metric-value">{formatTime(report.totalLoggedTime)}</h3>
                </div>
              </div>
              
              <div className="wg-metric-card">
                <span className="wg-metric-icon" style={{background: "#dcfce7", color: "#16a34a"}}>⚡</span>
                <div>
                  <p className="wg-metric-label">Productivity Index</p>
                  <h3 className="wg-metric-value">{report.productivityScore}%</h3>
                </div>
              </div>

              <div className="wg-metric-card">
                <span className="wg-metric-icon" style={{background: "#fef3c7", color: "#d97706"}}>🎯</span>
                <div>
                  <p className="wg-metric-label">Focus Score</p>
                  <h3 className="wg-metric-value">{report.focusScore}%</h3>
                </div>
              </div>

              <div className="wg-metric-card">
                <span className="wg-metric-icon" style={{background: "#fee2e2", color: "#dc2626"}}>❤️</span>
                <div>
                  <p className="wg-metric-label">Burnout Risk</p>
                  <h3 className="wg-metric-value" style={{color: report.burnoutRisk === "HIGH" ? "#dc2626" : report.burnoutRisk === "MEDIUM" ? "#d97706" : "#16a34a"}}>{report.burnoutRisk}</h3>
                </div>
              </div>
            </div>

            <div className="wg-report-details-grid">
              {/* Time Breakdown Bar */}
              <div className="wg-report-detail-card">
                <h4 className="wg-detail-title">Time Breakdown</h4>
                
                <div className="wg-time-bar-container">
                  <div className="wg-time-bar">
                    <div className="wg-time-segment bg-active" style={{width: `${report.totalLoggedTime > 0 ? (report.activeTime / report.totalLoggedTime) * 100 : 0}%`}}></div>
                    <div className="wg-time-segment bg-idle" style={{width: `${report.totalLoggedTime > 0 ? (report.idleTime / report.totalLoggedTime) * 100 : 0}%`}}></div>
                    <div className="wg-time-segment bg-break" style={{width: `${report.totalLoggedTime > 0 ? (report.breakTime / report.totalLoggedTime) * 100 : 0}%`}}></div>
                    <div className="wg-time-segment bg-waiting" style={{width: `${report.totalLoggedTime > 0 ? (report.waitingTime / report.totalLoggedTime) * 100 : 0}%`}}></div>
                  </div>
                </div>

                <div className="wg-time-legend">
                  <div className="wg-legend-item"><span className="wg-dot bg-active"></span> Active ({formatTime(report.activeTime)})</div>
                  <div className="wg-legend-item"><span className="wg-dot bg-idle"></span> Idle ({formatTime(report.idleTime)})</div>
                  <div className="wg-legend-item"><span className="wg-dot bg-break"></span> Break ({formatTime(report.breakTime)})</div>
                  <div className="wg-legend-item"><span className="wg-dot bg-waiting"></span> Waiting ({formatTime(report.waitingTime)})</div>
                </div>
              </div>

              {/* App Usage Top 5 */}
              <div className="wg-report-detail-card">
                <h4 className="wg-detail-title">Top Applications Used</h4>
                
                {(!report.appUsageSummary || report.appUsageSummary.length === 0) ? (
                  <p className="wg-muted" style={{marginTop: "16px"}}>No application data recorded for this day.</p>
                ) : (
                  <div className="wg-app-list">
                    {report.appUsageSummary.slice(0, 5).map((app, index) => {
                      // Calculate percentage based on top app to make bars visually distinct
                      const maxAppTime = report.appUsageSummary[0].duration;
                      const percent = Math.max(5, (app.duration / maxAppTime) * 100);
                      
                      return (
                        <div key={index} className="wg-app-row">
                          <div className="wg-app-info">
                            <span className="wg-app-name">{app.app}</span>
                            <span className="wg-app-time">{formatTime(app.duration)}</span>
                          </div>
                          <div className="wg-app-progress-bg">
                            <div className="wg-app-progress-fill" style={{width: `${percent}%`}}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Premium CSS */}
      <style>{`
        .wg-report-page{
          padding: 22px 26px;
          min-height: calc(100vh - 64px);
          background: #f8fafc;
          font-family: "Inter", "Segoe UI", Roboto, sans-serif;
          color: #1e293b;
          line-height: 1.5;
        }

        .wg-report-head{
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:18px;
          margin-bottom: 24px;
        }

        .wg-report-title{
          margin: 0;
          font-size: 28px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.02em;
        }

        .wg-report-sub{
          margin-top: 6px;
          font-weight: 600;
          color: #16a34a;
          font-size: 15px;
        }

        .wg-report-emp{
          margin-top: 10px;
          font-weight: 500;
          color: #64748b;
          font-size: 14px;
        }

        .wg-att-badge-wrap{
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:8px;
        }

        .wg-att-badge{
          width: 64px;
          height: 64px;
          border-radius: 999px;
          display:flex;
          align-items:center;
          justify-content:center;
          font-weight: 800;
          color: #ffffff;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          box-shadow: 0 10px 25px rgba(59, 130, 246, 0.2);
          font-size: 15px;
        }

        .wg-att-badge-text{
          margin:0;
          font-weight: 700;
          color: #475569;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .wg-section{
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          margin-top: 24px;
        }

        .wg-section-top{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }

        .wg-section-title{
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
        }

        .wg-summary-grid{
          display:grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .wg-card{
          border-radius: 12px;
          padding: 16px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          transition: transform 0.2s;
        }

        .wg-card-title{
          margin: 0;
          font-weight: 600;
          color: #64748b;
          font-size: 13px;
        }

        .wg-card-big{
          margin: 8px 0 4px;
          font-weight: 800;
          color: #0f172a;
          font-size: 24px;
        }

        .wg-card-sub{
          margin: 0;
          color: #94a3b8;
          font-weight: 500;
          font-size: 12px;
        }

        .wg-recent-box{
          margin-top: 24px;
          border-radius: 12px;
          padding: 20px;
          background: #ffffff;
          border: 1px solid #f1f5f9;
        }

        .wg-recent-title{
          margin: 0 0 16px 0;
          font-weight: 700;
          color: #0f172a;
          font-size: 16px;
        }

        .wg-recent-list{
          display:grid;
          gap: 12px;
        }

        .wg-recent-item{
          display:flex;
          justify-content:space-between;
          gap:12px;
          padding: 14px;
          border-radius: 12px;
          background: #f8fafc;
          border: 1px solid #f1f5f9;
        }

        .wg-pill{
          height: fit-content;
          padding: 4px 12px;
          border-radius: 999px;
          background: #e0f2fe;
          border: 1px solid #bae6fd;
          font-weight: 700;
          font-size: 11px;
          color: #0369a1;
          white-space: nowrap;
          text-transform: uppercase;
        }

        .wg-note{
          margin: 8px 0 0;
          font-style: italic;
          font-weight: 500;
          color: #475569;
          font-size: 13px;
          border-left: 2px solid #e2e8f0;
          padding-left: 8px;
        }

        .wg-btn{
          padding: 10px 20px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: white;
          font-weight: 600;
          font-size: 14px;
          cursor:pointer;
          transition: all 0.2s;
        }

        .wg-btn:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .wg-btn:disabled{
          opacity: 0.5;
          cursor: not-allowed;
        }

        .wg-btn-primary{
          border: none;
          background: #2563eb;
          color: #ffffff;
        }

        .wg-btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
        }

        .wg-btn-success{
          border: none;
          background: #16a34a;
          color: white;
        }

        .wg-btn-success:hover:not(:disabled) {
          background: #15803d;
        }

        .wg-msg{
          margin-top: 16px;
          font-weight: 600;
          color: #2563eb;
          font-size: 14px;
        }

        .wg-muted{
          font-weight: 500;
          color: #94a3b8;
          font-size: 14px;
        }

        .wg-report-card{
          margin-top: 20px;
          padding: 24px;
          border-radius: 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          max-width: 600px;
        }

        .wg-report-card h3 {
          margin-top: 0;
          font-size: 18px;
          color: #0f172a;
          margin-bottom: 16px;
        }

        .wg-report-card p {
          margin: 8px 0;
          font-size: 14px;
          color: #475569;
        }

        .wg-report-card hr {
          border: 0;
          border-top: 1px solid #e2e8f0;
          margin: 16px 0;
        }

        /* ===== NEW REPORT DASHBOARD CSS ===== */
        .wg-report-dashboard {
          margin-top: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .wg-report-header-card {
          background: #ffffff;
          border-radius: 16px;
          padding: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .wg-report-date {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
        }

        .wg-report-time-range {
          margin: 6px 0 0;
          font-size: 15px;
          color: #64748b;
          font-weight: 500;
        }

        .wg-report-status-badge {
          padding: 8px 16px;
          border-radius: 999px;
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 0.05em;
        }
        
        .wg-report-status-badge.PRESENT { background: #dcfce7; color: #16a34a; }
        .wg-report-status-badge.PARTIAL { background: #fef3c7; color: #d97706; }
        .wg-report-status-badge.ABSENT { background: #fee2e2; color: #dc2626; }

        .wg-report-metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .wg-metric-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          transition: transform 0.2s;
        }
        
        .wg-metric-card:hover {
          transform: translateY(-2px);
        }

        .wg-metric-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          flex-shrink: 0;
        }

        .wg-metric-label {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
        }

        .wg-metric-value {
          margin: 4px 0 0;
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
        }

        .wg-report-details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .wg-report-detail-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .wg-detail-title {
          margin: 0 0 20px;
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
        }

        .wg-time-bar-container {
          margin-top: 10px;
        }

        .wg-time-bar {
          display: flex;
          height: 24px;
          border-radius: 12px;
          overflow: hidden;
          background: #f1f5f9;
        }

        .wg-time-segment {
          height: 100%;
          transition: width 0.5s ease;
        }

        .bg-active { background: #3b82f6; }
        .bg-idle { background: #94a3b8; }
        .bg-break { background: #10b981; }
        .bg-waiting { background: #f59e0b; }

        .wg-time-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-top: 20px;
        }

        .wg-legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 500;
          color: #475569;
        }

        .wg-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .wg-app-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .wg-app-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .wg-app-info {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          font-weight: 600;
        }

        .wg-app-name { color: #0f172a; }
        .wg-app-time { color: #64748b; }

        .wg-app-progress-bg {
          height: 8px;
          background: #f1f5f9;
          border-radius: 4px;
          overflow: hidden;
        }

        .wg-app-progress-fill {
          height: 100%;
          background: #0ea5e9;
          border-radius: 4px;
          transition: width 0.5s ease;
        }

        @media(max-width: 1100px){
          .wg-summary-grid{ grid-template-columns: 1fr 1fr; }
          .wg-report-metrics-grid{ grid-template-columns: 1fr 1fr; }
          .wg-report-details-grid{ grid-template-columns: 1fr; }
        }

        @media(max-width: 650px){
          .wg-report-head{ flex-direction: column; align-items: flex-start; }
          .wg-summary-grid{ grid-template-columns: 1fr; }
          .wg-report-metrics-grid{ grid-template-columns: 1fr; }
          .wg-report-header-card { flex-direction: column; align-items: flex-start; gap: 12px; }
        }

        @media print {
          .wg-btn, .wg-section-top button { display: none !important; }
          .wg-report-page { background: white; padding: 0; }
          .wg-section, .wg-report-header-card, .wg-metric-card, .wg-report-detail-card { box-shadow: none; border: 1px solid #eee; }
        }
      `}</style>
    </div>
  );
};

export default WorkReport;
