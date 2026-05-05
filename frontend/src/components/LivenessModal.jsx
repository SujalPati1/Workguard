// frontend/src/components/LivenessModal.jsx
//
// Presence verification modal.
// Phase 1: Permission screen with "Verify Liveness" button + 10-minute countdown.
//          If the countdown hits zero, onTimeout(slotIndex) is called → MISSED.
// Phase 2: After clicking Verify, camera activates and biometric check runs.
//          Auto-dismisses on is_live: true and notifies parent via onVerified().

import React, { useEffect, useRef, useState } from "react";

// Default response window: 10 minutes. Can be overridden via prop.
const DEFAULT_RESPONSE_WINDOW_MS = 10 * 60 * 1000;

const LivenessModal = ({ slotIndex, responseWindowMs = DEFAULT_RESPONSE_WINDOW_MS, onStart, onVerified, onTimeout }) => {
  const [isStarted, setIsStarted]  = useState(false);
  const [score, setScore]           = useState(0);
  const [status, setStatus]         = useState("Initialising…");
  const [challenge, setChallenge]   = useState(null);
  const [dots, setDots]             = useState(".");
  const [timeLeft, setTimeLeft]     = useState(Math.floor(responseWindowMs / 1000)); // seconds

  const unsubRef      = useRef(null);
  const verifyTimeRef = useRef(null);   // timeout for biometric check (90s)
  const missedTimerRef = useRef(null);  // countdown until MISSED

  // Animated ellipsis
  useEffect(() => {
    const id = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 600);
    return () => clearInterval(id);
  }, []);

  // 10-minute countdown — starts immediately when modal opens, before user clicks Verify
  useEffect(() => {
    if (isStarted) return; // once started, biometric timeout takes over

    const tick = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(tick);
          if (missedTimerRef.current) clearTimeout(missedTimerRef.current);
          onTimeout(slotIndex);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    // Also set a hard timeout at the exact window boundary
    missedTimerRef.current = setTimeout(() => {
      clearInterval(tick);
      onTimeout(slotIndex);
    }, responseWindowMs);

    return () => {
      clearInterval(tick);
      clearTimeout(missedTimerRef.current);
    };
  }, [isStarted, slotIndex, responseWindowMs, onTimeout]);

  // Subscribe to engine telemetry ONLY after user clicks "Verify Liveness"
  useEffect(() => {
    if (!isStarted) return;

    // Clear the missed timer — user is now actively verifying
    clearTimeout(missedTimerRef.current);

    if (!window.electronAPI?.onTelemetry) {
      // Browser dev mode — simulate pass after 3s
      const t = setTimeout(() => onVerified(), 3000);
      return () => clearTimeout(t);
    }

    // 90-second hard timeout for biometric check itself
    verifyTimeRef.current = setTimeout(() => {
      if (unsubRef.current) unsubRef.current();
      onTimeout(slotIndex);
    }, 90_000);

    unsubRef.current = window.electronAPI.onTelemetry((data) => {
      const s = Math.min(Math.round(data.liveness_score || 0), 100);
      setScore(s);
      setStatus(data.liveness_status || "Checking…");
      setChallenge(data.challenge || null);

      if (data.is_live === true) {
        clearTimeout(verifyTimeRef.current);
        if (unsubRef.current) unsubRef.current();
        onVerified();
      }
    });

    return () => {
      clearTimeout(verifyTimeRef.current);
      if (unsubRef.current) unsubRef.current();
    };
  }, [isStarted, slotIndex, onVerified, onTimeout]);

  const handleStart = () => {
    setIsStarted(true);
    if (onStart) onStart();
  };

  // Progress ring
  const radius    = 70;
  const circumf   = 2 * Math.PI * radius;
  const dashOffset = circumf * (1 - score / 100);
  const ringColor  = score >= 80 ? "#22c55e" : score >= 40 ? "#3b82f6" : "#94a3b8";

  // Countdown colour: red when < 60s
  const countdownColor = timeLeft < 60 ? "#ef4444" : "#94a3b8";
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {/* Ring + eye icon */}
        <div style={{ position: "relative", width: 180, height: 180, margin: "0 auto 28px" }}>
          <svg width={180} height={180} style={{ transform: "rotate(-90deg)" }}>
            <circle cx={90} cy={90} r={radius} fill="none" stroke="#1e293b" strokeWidth={10} />
            {isStarted && (
              <circle
                cx={90} cy={90} r={radius}
                fill="none"
                stroke={ringColor}
                strokeWidth={10}
                strokeDasharray={circumf}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.4s ease" }}
              />
            )}
          </svg>
          <div style={eyeWrapStyle}>
            <span style={{ fontSize: 42, filter: `drop-shadow(0 0 12px ${isStarted ? ringColor : "#94a3b8"})` }}>
              👁️
            </span>
          </div>
        </div>

        <h2 style={titleStyle}>Presence Check — Slot {slotIndex}/3</h2>

        {!isStarted ? (
          <div style={{ marginTop: 8 }}>
            <p style={{ color: "#94a3b8", marginBottom: 12, fontSize: 14, lineHeight: 1.6 }}>
              It is time for your scheduled liveness check.<br />
              Click below to activate your camera and verify you are present.
            </p>

            {/* Countdown */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: countdownColor, fontSize: 13, marginBottom: 4 }}>
                This check will expire in:
              </p>
              <span style={{
                fontSize: 28, fontWeight: 800, color: countdownColor,
                letterSpacing: "0.05em",
                transition: "color 0.3s"
              }}>
                {mm}:{ss}
              </span>
              {timeLeft < 60 && (
                <p style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>
                  ⚠️ Verify now or this slot will be marked as Missed
                </p>
              )}
            </div>

            <button
              onClick={handleStart}
              style={{
                background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                color: "white", border: "none",
                padding: "14px 32px",
                borderRadius: 10, fontSize: 15, fontWeight: "bold",
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(59,130,246,0.45)",
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              onMouseOver={e => e.currentTarget.style.transform = "scale(1.03)"}
              onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
            >
              Verify Liveness
            </button>
          </div>
        ) : (
          <>
            {challenge && challenge.active ? (
              <p style={promptStyle}>
                Please blink <strong>{challenge.required - challenge.done}</strong> more
                time{challenge.required - challenge.done !== 1 ? "s" : ""}
                {" "}to verify{dots}
              </p>
            ) : (
              <p style={promptStyle}>
                Please look at your screen and blink naturally{dots}
              </p>
            )}

            <div style={{ ...badgeStyle, background: score >= 80 ? "#14532d" : "#1e3a5f" }}>
              {status === "Calibrating" ? "🔬 Calibrating…" : `🔍 ${status}`}
            </div>

            <div style={barTrackStyle}>
              <div
                style={{
                  ...barFillStyle,
                  width: `${score}%`,
                  background: `linear-gradient(90deg, #3b82f6, ${ringColor})`,
                }}
              />
            </div>
            <p style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
              Liveness score: <strong>{score}</strong> / 100
            </p>

            <p style={{ color: "#475569", fontSize: 12, marginTop: 16, lineHeight: 1.6 }}>
              Your camera is temporarily active for verification only.
              <br />No footage is stored or transmitted.
            </p>
          </>
        )}
      </div>

      <style>{`
        @keyframes wg-pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
          70%  { box-shadow: 0 0 0 18px rgba(59,130,246,0); }
          100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
        }
      `}</style>
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const overlayStyle = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.75)",
  backdropFilter: "blur(10px)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9999,
};

const cardStyle = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 28,
  padding: "40px 36px",
  textAlign: "center",
  maxWidth: 440,
  width: "90%",
  boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
  animation: "wg-pulse-ring 2.5s infinite",
};

const eyeWrapStyle = {
  position: "absolute", inset: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
};

const titleStyle = {
  color: "#f1f5f9", fontSize: 22, fontWeight: 700, margin: "0 0 10px",
};

const promptStyle = {
  color: "#94a3b8", fontSize: 15, lineHeight: 1.6, margin: "0 0 20px",
};

const badgeStyle = {
  display: "inline-block", color: "#e2e8f0",
  fontSize: 13, fontWeight: 600,
  padding: "8px 18px", borderRadius: 999, marginBottom: 18,
};

const barTrackStyle = {
  width: "100%", height: 8,
  background: "#1e293b", borderRadius: 999, overflow: "hidden",
};

const barFillStyle = {
  height: "100%", borderRadius: 999, transition: "width 0.4s ease",
};

export default LivenessModal;
