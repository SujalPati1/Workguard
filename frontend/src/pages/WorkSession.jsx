import { useSession } from "../context/SessionContext";
import { useNavigate } from "react-router-dom";
import React, { useState, useEffect, useRef, useMemo } from "react";

import {
  startSessionApi,
  resumeSessionApi,
  stopSessionApi,
  checkpointApi,
} from "../utils/attendanceApi";

import ToggleSwitch from "../components/ToggleSwitch";
import StatCard from "../components/StatCard";

const formatTime = (sec) => {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const WorkSession = () => {
  const { employee, workSessionState, updateWorkSession, incrementActiveTime, incrementIdleTime, incrementWaitingTime, incrementBreakTime, setWorkStatus: setWorkStatusCtx, lastActivityRef } = useSession();
  const navigate = useNavigate();

  // Destructure from context (persistent across page navigation)
  const running = workSessionState.running;
  const sessionId = workSessionState.sessionId;
  const activeSec = workSessionState.activeSec;
  const idleSec = workSessionState.idleSec;
  const waitingSec = workSessionState.waitingSec;
  const breakSec = workSessionState.breakSec;
  const focusMode = workSessionState.focusMode;
  const workStatus = workSessionState.workStatus;

  // lastActivityRef comes from SessionContext — shared with the global timer
  // so navigating back to this page keeps the same idle-detection baseline.

  // ===== LOCAL STATES (UI only) =====
  const [showJoke, setShowJoke] = useState(false);
  const [currentJoke, setCurrentJoke] = useState("");
  const [pulseSmile, setPulseSmile] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const jokeShownRef = useRef(false);

const jokes = [
    "Why do developers love coffee? Because Java ☕",
    "Your code works? Don't touch it 😄",
    "Small breaks prevent big breakdowns 😊",
    "Debugging: Being the detective in a crime movie where you are also the criminal 😅",
    "Hydrate. Stretch. Smile. Repeat 💧",
    "I don't rise and shine. I caffeinate and hope ☕",
    "Life is short. Smile while you still have teeth 😁",
    "I don't need a motivational quote. I need snacks 🍫",
    "Brain: Let's be productive. Also brain: Let's watch random videos.",
  ];

  // ===== IDLE THRESHOLD =====
  const idleThresholdSec = useMemo(() => {
    return focusMode ? 30 * 60 : 10 * 60;
  }, [focusMode]);

  // ===== LOCAL ACTIVITY BOOST =====
  // The global listener in SessionContext already tracks activity app-wide.
  // This one just ensures clicks/keys ON this page are captured immediately.
  useEffect(() => {
    const update = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener("mousemove", update);
    window.addEventListener("keydown",   update);
    window.addEventListener("click",     update);
    return () => {
      window.removeEventListener("mousemove", update);
      window.removeEventListener("keydown",   update);
      window.removeEventListener("click",     update);
    };
  }, [lastActivityRef]);

  const totalTime = activeSec + idleSec + waitingSec + breakSec;

  // ===== AUTO SMILE TRIGGER =====
useEffect(() => {
  if (!running) return;

  // Trigger after 75 minutes active time
  if (activeSec > 75 * 60 && !jokeShownRef.current) {
    setPulseSmile(true);
  }

}, [activeSec, running]);

  // Auto-checkpoint and idle threshold are now managed by SessionContext.
  // No duplicate intervals here.

  // ===== START =====
  const handleStart = async () => {
    if (!employee?.empId) return;

    try {
      const res = await startSessionApi({
        empId: employee.empId,
        focusMode,
        workStatus,
      });

      if (res?.session?._id) {
        updateWorkSession({
          sessionId: res.session._id,
          running: true,
        });
        setStatusMessage("");
      }
    } catch (err) {
      if (err.body?.session?._id) {
        const s = err.body.session;
        updateWorkSession({
          sessionId: s._id,
          running: true,
          activeSec: s.activeTime || 0,
          idleSec: s.idleTime || 0,
          waitingSec: s.waitingTime || 0,
          breakSec: s.breakTime || 0,
          focusMode: !!s.focusMode,
          workStatus: s.workStatus || "WORKING",
          startTime: s.startTime ? new Date(s.startTime).getTime() : Date.now(),
        });
      } else {
        console.error("Start session failed", err);
      }
    }
  };

  // ===== RESUME =====
  const handleResume = async () => {
    if (!employee?.empId) return;

    try {
      const res = await resumeSessionApi({
        empId: employee.empId,
      });

      if (res?.session?._id) {
        const s = res.session;

        updateWorkSession({
          sessionId: s._id,
          running: true,
          activeSec: s.activeTime || 0,
          idleSec: s.idleTime || 0,
          waitingSec: s.waitingTime || 0,
          breakSec: s.breakTime || 0,
          focusMode: !!s.focusMode,
          workStatus: s.workStatus || "WORKING",
          startTime: s.startTime ? new Date(s.startTime).getTime() : Date.now(),
        });
        setStatusMessage("");
      }
    } catch (err) {
      if (err.status === 404 || err.body?.message?.includes("No")) {
        setStatusMessage("No active session to resume. Start a new session.");
      } else {
        console.error("Resume session failed:", err);
        setStatusMessage("Unable to resume session right now.");
      }
    }
  };

  useEffect(() => {
    if (!employee?.empId || running || sessionId) return;

    const restoreSession = async () => {
      try {
        const res = await resumeSessionApi({ empId: employee.empId });
        if (res?.session?._id) {
          const s = res.session;
          updateWorkSession({
            sessionId: s._id,
            running: true,
            activeSec: s.activeTime || 0,
            idleSec: s.idleTime || 0,
            waitingSec: s.waitingTime || 0,
            breakSec: s.breakTime || 0,
            focusMode: !!s.focusMode,
            workStatus: s.workStatus || "WORKING",
            startTime: s.startTime ? new Date(s.startTime).getTime() : Date.now(),
          });
        }
      } catch (err) {
        if (err.status === 404) {
          setStatusMessage("No active session found. Start a new session to begin tracking.");
        } else {
          setStatusMessage("Unable to restore session right now.");
          console.error("Restore session failed", err);
        }
      }
    };

    restoreSession();
  }, [employee?.empId, running, sessionId, updateWorkSession]);

  const handleStop = async () => {
    if (!sessionId) return;

    const confirmStop = window.confirm("Do you really want to end this session?");
    if (!confirmStop) return;

    // Stop timer immediately
    updateWorkSession({ running: false });

    try {
      await stopSessionApi({
        sessionId,
        activeSeconds: activeSec,
        idleSeconds: idleSec,
        waitingSeconds: waitingSec,
        breakSeconds: breakSec,
      });

      // Clear session state
      updateWorkSession({
        running: false,
        sessionId: null,
        activeSec: 0,
        idleSec: 0,
        waitingSec: 0,
        breakSec: 0,
        focusMode: false,
        workStatus: "WORKING",
      });

      // Redirect to Summary page
      navigate("/attendance-summary");
    } catch (err) {
      console.error("Stop session failed", err);
    }
  };
  const generateJoke = () => {
    const random = jokes[Math.floor(Math.random() * jokes.length)];
    setCurrentJoke(random);
    setShowJoke(true);
    setPulseSmile(false);
    jokeShownRef.current = true;

    setTimeout(() => {
      setShowJoke(false);
    }, 8000);
  };


  return (
    <div className="ws-bg">
      <div className="ws-blob ws-blob-1" />
      <div className="ws-blob ws-blob-2" />

      <div className="ws-container">

        {/* Header */}
        <div className="ws-header">
          <div>
            <span className="ws-chip">🕒 Work Session Tracker</span>
            <h1>Track Your Productivity</h1>
            <p>
              Fair attendance tracking with Active, Idle, Waiting, and Break time
              monitoring
            </p>
          </div>

          <div className="ws-header-right">
            <span className={`ws-status ${running ? "active" : "inactive"}`}>
              ● {running ? "Running" : "Inactive"}
            </span>
            <span className="ws-user">
              {employee ? employee.empId : "Not Logged"}
            </span>
          </div>
        </div>

        {statusMessage && (
          <div
            style={{
              margin: "1rem 0",
              padding: "0.9rem 1rem",
              borderRadius: "14px",
              background: "#f7f3e9",
              color: "#6a4f1d",
              border: "1px solid #f0d8a7",
            }}
          >
            {statusMessage}
          </div>
        )}

        {/* HERO TIMER */}
        <div className="ws-hero">
          <div className="ws-hero-inner">
            <div className="ws-hero-time">
              {formatTime(totalTime)}
            </div>

            <div className="ws-hero-metrics">
              <span>⚡ Active <b>{formatTime(activeSec)}</b></span>
              <span>⏸ Idle <b>{formatTime(idleSec)}</b></span>
              <span>⏳ Waiting <b>{formatTime(waitingSec)}</b></span>
              <span>☕ Break <b>{formatTime(breakSec)}</b></span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="ws-controls">

          <div className="ws-card">
            <div className="ws-card-head">
              <span className="icon blue">🌙</span>
              <div>
                <h3>Focus Mode</h3>
                <p>Extended idle threshold for deep work</p>
              </div>
            </div>

            <ToggleSwitch
              isOn={focusMode}
              onToggle={() => updateWorkSession({ focusMode: !focusMode })}
            />

            <div className="ws-info">
              ⏱ Idle threshold: <b>{focusMode ? "30 min" : "10 min"}</b>
            </div>
          </div>

          <div className="ws-card">
            <div className="ws-card-head">
              <span className="icon green">⚡</span>
              <div>
                <h3>Work Status</h3>
                <p>Your current activity state</p>
              </div>
            </div>

            <div className="ws-status-grid">
  {[
    { label: "Working", value: "WORKING", icon: "⚡" },
    { label: "Waiting", value: "WAITING", icon: "⏳" },
    { label: "Break", value: "BREAK", icon: "☕" },
  ].map((item) => (
    <div
      key={item.value}
      className={`ws-status-pill ${
        workStatus === item.value ? "active" : ""
      }`}
      onClick={() => setWorkStatusCtx(item.value)}
    >
      <span>{item.icon}</span>
      <b>{item.label}</b>
    </div>
  ))}
</div>

            <div className="ws-info">
              📈 Tracked separately for accuracy
            </div>
          </div>

          <div className="smile-card-enhanced">

  <h3 className="smile-title">Smile Break</h3>

  <div
    className={`smile-icon-enhanced ${pulseSmile ? "pulse" : ""}`}
    onClick={generateJoke}
  >
    😊
  </div>

  <p className="smile-subtext">
    A light moment to refresh your focus.
  </p>

  {showJoke && (
    <div className="joke-box-enhanced">
      {currentJoke}
    </div>
  )}

</div>
        </div>

        {/* Stats */}
        <div className="ws-stats">
          <StatCard title="Active Time" value={formatTime(activeSec)} />
          <StatCard title="Idle Time" value={formatTime(idleSec)} />
          <StatCard title="Waiting Time" value={formatTime(waitingSec)} />
          <StatCard title="Break Time" value={formatTime(breakSec)} />
        </div>

        {/* Actions */}
        <div className="ws-actions">
          <button className="btn primary" onClick={handleStart} disabled={running}>
            ▶ Start Session
          </button>
          <button className="btn" onClick={handleResume}>
            ⟳ Resume Session
          </button>
          
          
          
            <button className="btn primary" onClick={handleStop}>
              ⏹ End Session
            </button>
          <button
            className="btn ghost"
            onClick={() => {
              updateWorkSession({
                activeSec: 0,
                idleSec: 0,
                waitingSec: 0,
                breakSec: 0,
              });
            }}
          >
            ↺ Reset Display
          </button>
        </div>
      </div>

      {/* KEEP YOUR EXISTING STYLE BLOCK EXACTLY AS IT IS BELOW */}

      {/* Styles */}
      <style>{`
        .ws-bg{
          min-height:100vh;
          background: linear-gradient(180deg,#eaf6ff 0%, #f0f9ff 60%, #ffffff 100%);
          font-family: "Segoe UI", system-ui, sans-serif;
          position: relative;
          overflow: hidden;
        }

        .ws-blob{
          position:absolute;
          border-radius:50%;
          filter: blur(120px);
          opacity:0.35;
          pointer-events:none;
        }

        .ws-blob-1{
          width:520px;height:520px;
          background:#7dd3fc;
          top:-120px;left:-120px;
        }

        .ws-blob-2{
          width:520px;height:520px;
          background:#a7f3d0;
          bottom:-160px;right:-160px;
        }

        .ws-container{
          max-width:1400px;
          margin:auto;
          padding:40px 40px 80px;
          position:relative;
          z-index:1;
        }

        .ws-header{
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          margin-bottom:36px;
        }

        .ws-chip{
          background:#fff;
          padding:6px 14px;
          border-radius:999px;
          font-weight:600;
          font-size:14px;
          display:inline-block;
          box-shadow:0 6px 20px rgba(0,0,0,0.08);
        }

        .ws-header h1{
          margin:14px 0 8px;
          font-size:44px;
          font-weight:800;
        }

        .ws-header p{
          color:#475569;
          max-width:620px;
          font-size:16px;
        }

        .ws-header-right{
          display:flex;
          gap:14px;
          align-items:center;
        }

        .ws-status{
          padding:8px 14px;
          border-radius:999px;
          font-weight:600;
          background:#fff;
        }

        .ws-status.active{
          color:#16a34a;
          background:#dcfce7;
        }

        .ws-status.inactive{
          color:#64748b;
          background:#f1f5f9;
        }

        .ws-user{
          background:#0ea5e9;
          color:white;
          padding:12px 18px;
          border-radius:16px;
          font-weight:700;
        }

        .ws-hero{
          margin-bottom:36px;
          background: rgba(255,255,255,0.85);
          border-radius:32px;
          box-shadow:0 40px 90px rgba(0,0,0,0.12);
        }

        .ws-hero-inner{
          padding:48px;
          text-align:center;
        }

        .ws-hero-time{
          font-size:64px;
          font-weight:800;
          letter-spacing:2px;
        }

        .ws-hero-metrics{
          margin-top:22px;
          display:flex;
          justify-content:center;
          gap:16px;
          flex-wrap:wrap;
        }

        .ws-hero-metrics span{
          background:#f8fafc;
          padding:12px 18px;
          border-radius:999px;
          font-weight:600;
          box-shadow: inset 0 0 0 1px #e5e7eb;
        }

        .ws-controls{
          display:grid;
          grid-template-columns:1fr 1fr 1fr;
          gap:24px;
          margin-bottom:36px;
        }

        .ws-card{
          background:white;
          border-radius:24px;
          padding:26px;
          box-shadow:0 25px 60px rgba(0,0,0,0.08);
        }

        .ws-card-muted{
          background:#f8fafc;
          color:#475569;
        }

        .ws-card-head{
          display:flex;
          gap:14px;
          align-items:flex-start;
          margin-bottom:18px;
        }

        .ws-status-grid {
  display: flex;
  gap: 12px;
  margin-top: 10px;
}

.ws-status-pill {
  flex: 1;
  padding: 14px;
  border-radius: 16px;
  background: #f1f5f9;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 600;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.ws-status-pill:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 25px rgba(0,0,0,0.1);
}

.ws-status-pill.active {
  background: linear-gradient(135deg,#0ea5e9,#6366f1);
  color: white;
  box-shadow: 0 15px 35px rgba(99,102,241,0.3);
}

        .icon{
          font-size:22px;
          width:46px;
          height:46px;
          border-radius:16px;
          display:flex;
          align-items:center;
          justify-content:center;
        }

        .icon.blue{background:#e0f2fe;}
        .icon.green{background:#dcfce7;}

        .ws-info{
          margin-top:16px;
          padding:14px;
          background:#f0f9ff;
          border-radius:16px;
          font-weight:600;
        }

        .ws-select{
          width:100%;
          padding:14px;
          border-radius:16px;
          border:1px solid #cbd5e1;
          font-size:15px;
        }

        .ws-stats{
          display:grid;
          grid-template-columns:repeat(4,1fr);
          gap:24px;
          margin-bottom:40px;
        }

        .ws-actions{
          display:flex;
          justify-content:center;
          gap:20px;
        }

        .btn {
  padding: 16px 28px;
  border-radius: 18px;
  border: none;
  font-weight: 700;
  background: white;
  cursor: pointer;
  box-shadow: 0 16px 40px rgba(0,0,0,0.12);
  transition: all 0.18s ease;
  transform: translateY(0);

        }
        .btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 22px 50px rgba(0,0,0,0.18);
}

.btn:active {
  transform: translateY(1px) scale(0.97);
  box-shadow: 0 8px 18px rgba(0,0,0,0.15);
}

        .btn.primary{
          background:#0ea5e9;
          color:white;
        }

        .btn.ghost{
          background:transparent;
          border:2px dashed #cbd5e1;
          box-shadow:none;
        }

        @media(max-width:1100px){
          .ws-controls{grid-template-columns:1fr;}
          .ws-stats{grid-template-columns:1fr 1fr;}
        }

        @media(max-width:600px){
          .ws-stats{grid-template-columns:1fr;}
          .ws-actions{flex-direction:column;}
        }
         
        /* ===== ENHANCED SMILE CARD ===== */

/* Merged single definition — second block values win for conflicting props,
   unique props from the first block are preserved */
.smile-icon-enhanced {
  font-size: 42px;
  cursor: pointer;
  transition: all 0.25s ease;
  background: white;
  padding: 14px;
  border-radius: 50%;
  box-shadow: 0 15px 35px rgba(0,0,0,0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
}

.smile-icon-enhanced:hover {
  transform: scale(1.15) rotate(5deg);
}

.pulse {
  animation: pulseAnim 1.5s infinite;
}

@keyframes pulseAnim {
  0% { transform: scale(1); }
  50% { transform: scale(1.25); }
  100% { transform: scale(1); }
}

.joke-box-enhanced {
  margin-top: 22px;
  padding: 18px;
  border-radius: 20px;
  background: white;
  font-weight: 600;
  font-size: 15px;
  color: #1e293b;   /* darker text */
  box-shadow: 0 18px 40px rgba(0,0,0,0.1);
  animation: fadeInSmooth 0.4s ease;
}

@keyframes fadeInSmooth {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
      `}</style>
    </div>
  );
};

export default WorkSession;

