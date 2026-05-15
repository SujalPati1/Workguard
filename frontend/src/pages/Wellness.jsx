import React, { useRef, useState, useEffect } from "react";
import { yawnCode, eyeCode, tiltCode } from "../data/modelCode";
import { useSession } from "../context/SessionContext";
import apiClient from "../api/apiClient";

const Wellness = () => {
  const { employee } = useSession();
  const videoRef = useRef(null);

  const [isCameraRunning, setIsCameraRunning] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [cameraConsent, setCameraConsent] = useState(false);
  const [loadingConsent, setLoadingConsent] = useState(true);

  // 🔥 FETCH CONSENT ON MOUNT
  useEffect(() => {
    if (!employee) return;

    const fetchConsent = async () => {
      try {
        setLoadingConsent(true);
        const res = await apiClient.get("/consent");
        const data = res.data;
        setCameraConsent(data?.data?.cameraEnabled || false);
      } catch (err) {
        console.error("Consent fetch error:", err);
      } finally {
        setLoadingConsent(false);
      }
    };

    fetchConsent();
  }, [employee]);

  const startCamera = async () => {
    if (!cameraConsent) {
      alert("❌ Camera access denied. Please enable camera in Consent Setup.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      setIsCameraRunning(true);
    } catch (err) {
      console.error(err);
      alert("❌ Unable to access camera. Please check your browser permissions.");
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;

    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    videoRef.current.srcObject = null;
    setIsCameraRunning(false);
  };

  return (
    <div>
      <h1 style={{ fontSize: "28px", fontWeight: "700" }}>
        🧠 Wellness Monitoring System (Prototype)
      </h1>

      {/* CAMERA + STATUS COMBINED */}
      <div style={mainBox}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ color: "#2563eb" }}>Live Wellness Feed</h2>

          {!isCameraRunning ? (
            <button 
              onClick={startCamera} 
              style={{
                ...btnStyle, 
                opacity: cameraConsent ? 1 : 0.5,
                cursor: cameraConsent ? "pointer" : "not-allowed"
              }}
            >
              ▶ Start
            </button>
          ) : (
            <button onClick={stopCamera} style={{ ...btnStyle, background: "red" }}>
              ⛔ Stop
            </button>
          )}
        </div>

        {!loadingConsent && !cameraConsent && (
          <div style={{
            background: "#fee2e2",
            color: "#dc2626",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "15px",
            fontWeight: "600",
            fontSize: "14px",
            border: "1px solid #fecaca"
          }}>
            ⚠️ Camera access is currently disabled. Please enable it in the 
            <a href="/consent-setup" style={{ color: "#dc2626", marginLeft: "5px" }}>Consent Setup</a>.
          </div>
        )}

        {/* VIDEO */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={videoStyle}
        />

        {/* COMBINED STATUS */}
        <div style={statusBox}>
          <div>👁 Eyes: <b>Open</b></div>
          <div>😴 Yawn: <b>No</b></div>
          <div>🧍 Posture: <b>Normal</b></div>
        </div>
      </div>

      {/* BUTTON TO SHOW ALL MODELS */}
      <button
        onClick={() => setShowCode(true)}
        style={{ ...btnStyle, marginTop: "20px" }}
      >
        View AI Models
      </button>

      {/* ALL MODELS TOGETHER 🔥 */}
      {showCode && (
        <div style={overlay}>
          <div style={modal}>
            <h2>AI Models Used</h2>

            <h4>😴 Yawn Detection</h4>
            <pre style={codeStyle}>{yawnCode}</pre>

            <h4>👁 Drowsiness Detection</h4>
            <pre style={codeStyle}>{eyeCode}</pre>

            <h4>🧍 Head Tilt Detection</h4>
            <pre style={codeStyle}>{tiltCode}</pre>

            <button onClick={() => setShowCode(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

// STYLES
const mainBox = {
  marginTop: "20px",
  padding: "20px",
  background: "#fff",
  borderRadius: "12px",
};

const videoStyle = {
  width: "100%",
  maxWidth: "700px",
  borderRadius: "10px",
  background: "black",
  marginTop: "10px"
};

const statusBox = {
  display: "flex",
  gap: "30px",
  marginTop: "15px",
  fontWeight: "500"
};

const btnStyle = {
  padding: "8px 14px",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer"
};

const overlay = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999
};

const modal = {
  background: "#0f172a",
  padding: "20px",
  borderRadius: "10px",
  width: "80%",
  maxHeight: "80vh",
  overflowY: "auto",
  color: "#fff"
};

const codeStyle = {
  color: "#22c55e",
  fontSize: "12px",
  whiteSpace: "pre-wrap",
  marginBottom: "15px"
};

export default Wellness;