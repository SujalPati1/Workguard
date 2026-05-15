import React, { useEffect, useRef, useState } from "react";
import { useSession } from "../context/SessionContext";
import { useLiveness } from "../context/LivenessEngine";
import apiClient from "../api/apiClient";

const Liveness = () => {
  const { employee } = useSession();

  const videoRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraConsent, setCameraConsent] = useState(false);
  const [loadingConsent, setLoadingConsent] = useState(true);
  const [status, setStatus] = useState("OFF");
  const { checksDone, setChecksDone, MAX_CHECKS } = useLiveness();
  const [showPrompt, setShowPrompt] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState(null);

  
  const DEMO_GAP = 20000; // 20 sec (demo instead of 2 hrs)

  // 🔥 FETCH CONSENT
  useEffect(() => {
    if (!employee?.empId) return;

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

  // 🔥 START CAMERA
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      videoRef.current.srcObject = stream;
    } catch (err) {
      console.error("Camera error:", err);
    }
  };

  // 🔥 STOP CAMERA
  const stopCamera = () => {
    const stream = videoRef.current?.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  // 🔥 CHECK ELIGIBILITY (DEMO LOGIC)
  const checkEligibility = () => {
  // 🔥 HARD STOP AFTER MAX CHECKS
  if (!cameraOn || checksDone >= MAX_CHECKS) {
    setShowPrompt(false); // ensure popup disappears
    return;
  }

  const now = Date.now();

  if (!lastCheckTime || now - lastCheckTime >= DEMO_GAP) {
    setShowPrompt(true);
  }
};

  // 🔥 INTERVAL CHECK
  useEffect(() => {
  if (!cameraOn || checksDone >= MAX_CHECKS) return; // 🔥 STOP interval

  const interval = setInterval(() => {
    checkEligibility();
  }, 5000);

  return () => clearInterval(interval);
}, [cameraOn, lastCheckTime, checksDone]);

  // 🔥 RUN CHECK (USER CLICK)
  const runLivenessCheck = async () => {
    setShowPrompt(false);

    try {
      await apiClient.post("/session/camera/start", { empId: employee.empId });

      await startCamera();
      setStatus("CHECKING");

      setTimeout(async () => {
        try {
          await apiClient.post("/session/camera/stop");
        } catch (err) {
          console.error("Camera stop error:", err);
        }

        stopCamera();
        setStatus("IDLE");

        setChecksDone((prev) => {
  const newCount = prev + 1;

  // 🔥 AUTO STOP AFTER 3
  if (newCount >= MAX_CHECKS) {
    setCameraOn(false);
    setShowPrompt(false);
    setStatus("VERIFIED ✅");
  }

  return newCount;
});
        setLastCheckTime(Date.now());
      }, 10000);
    } catch (err) {
      console.error(err);
    }
  };

  // 🔥 TOGGLE
  const handleToggle = () => {
    if (!cameraConsent) {
      alert("Enable camera in Consent first");
      return;
    }

    const newState = !cameraOn;
    setCameraOn(newState);

    if (newState) {
      setStatus("WAITING...");
      setChecksDone(0);
      setLastCheckTime(null);
    } else {
      stopCamera();
      setStatus("OFF");
      setShowPrompt(false);
    }
  };

  // 🔥 CLEANUP
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Liveness Detection</h1>

      <p style={styles.note}>
        🔒 No images/videos are stored. Only real-time verification.
      </p>

      {/* ⚠ Consent Warning */}
      {!loadingConsent && !cameraConsent && (
          <div style={{
            background: "#fee2e2",
            color: "#dc2626",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "15px",
            fontWeight: "600",
            fontSize: "14px",
            border: "1px solid #fecaca",
            width: "fit-content",
            margin: "0 auto 20px"
          }}>
            ⚠️ Camera access is currently disabled. Please enable it in the 
            <a href="/consent-setup" style={{ color: "#dc2626", marginLeft: "5px" }}>Consent Setup</a>.
          </div>
        )}

      {/* 🔔 PROMPT */}
      {showPrompt && (
        <div style={styles.prompt}>
          🔔 Quick verification required
          <button onClick={runLivenessCheck} style={styles.promptBtn}>
            Start Verification
          </button>
        </div>
      )}

      {/* Toggle */}
      <div style={styles.toggleRow}>
        <span>Enable Smart Liveness</span>
        <button
          
  onClick={handleToggle}
  disabled={!cameraConsent || checksDone >= MAX_CHECKS}
          style={{
            ...styles.button,
            background: cameraConsent ? "#2563eb" : "#9ca3af",
          }}
        >
          {cameraOn ? "Turn OFF" : "Turn ON"}
        </button>
      </div>

      {/* Status */}
      <div style={styles.status}>
        Status: <b>{status}</b>
      </div>

      {/* Checks */}
      <div style={styles.status}>
        Checks Done: {checksDone} / 3
      </div>

      {checksDone >= MAX_CHECKS && (
  <div style={{ color: "green", fontWeight: "bold" }}>
    ✅ User Verified Successfully
  </div>
)}

      {/* Camera */}
      <video ref={videoRef} autoPlay playsInline style={styles.video} />
    </div>
  );
};


const styles = {
  container: { padding: "30px" },
  title: { fontSize: "24px", fontWeight: "600" },
  note: { color: "#64748b", marginBottom: "20px" },
  toggleRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "20px",
  },
  button: {
    padding: "8px 16px",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  status: { marginBottom: "10px" },
  video: {
    width: "400px",
    height: "300px",
    borderRadius: "12px",
    background: "#000",
  },
  score: { marginTop: "10px" },
  prompt: {
    background: "#fef3c7",
    padding: "12px",
    borderRadius: "8px",
    marginBottom: "15px",
  },
  promptBtn: {
    marginLeft: "15px",
    padding: "6px 12px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
};

export default Liveness;