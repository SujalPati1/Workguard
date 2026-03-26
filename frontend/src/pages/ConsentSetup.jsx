import React, { useState, useEffect } from "react";
import { useSession } from "../context/SessionContext";
import { getConsent, saveConsent } from "../api/consentApi";

const ConsentSetup = () => {
  const { employee } = useSession(); // 👈 user comes from backend/session

  const [consent, setConsent] = useState({
    userId: "", // initially empty
    trackingEnabled: true,
    wellnessEnabled: true,
    cameraEnabled: false,
    deleteAllowed: true,
  });

  const [retention, setRetention] = useState("30 days");
  const [message, setMessage] = useState("");

  const loadConsent = async () => {
    try {
      const result = await getConsent();
      if (result.success && result.data) {
        setConsent({
          userId: employee.id,
          trackingEnabled: result.data.trackingEnabled ?? true,
          wellnessEnabled: result.data.wellnessEnabled ?? true,
          cameraEnabled: result.data.cameraEnabled ?? false,
          deleteAllowed: result.data.deleteAllowed ?? true,
        });
        setRetention(result.data.retention ?? "30 days");
      } else {
        // If no data, set defaults
        setConsent({
          userId: employee.id,
          trackingEnabled: true,
          wellnessEnabled: true,
          cameraEnabled: false,
          deleteAllowed: true,
        });
        setRetention("30 days");
      }
    } catch (err) {
      console.error("Error loading consent:", err);
      // On error, set defaults
      setConsent({
        userId: employee.id,
        trackingEnabled: true,
        wellnessEnabled: true,
        cameraEnabled: false,
        deleteAllowed: true,
      });
      setRetention("30 days");
    }
  };

  /* -------------------------
     SET USER ID FROM BACKEND
  -------------------------- */
  useEffect(() => {
    if (employee?._id) {
      loadConsent();
    }
  }, [employee]);

  const handleToggle = (key) => {
    setConsent((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    const payload = {
      trackingEnabled: consent.trackingEnabled,
      wellnessEnabled: consent.wellnessEnabled,
      cameraEnabled: consent.cameraEnabled,
      deleteAllowed: consent.deleteAllowed,
      retention
    };

    try {
      const response = await saveConsent(payload);

      if (response.success) {
        const days = parseInt(retention.split(' ')[0]);
        setMessage(`✅ Changes saved to DB. Data will be stored for ${days} days.`);
        await loadConsent(); // Reload data after save
      } else {
        setMessage(`⚠️ Unable to save: ${response.message || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Save consent failed", err);
      setMessage("⚠️ Failed to save consent. Please try again.");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Privacy Center</h1>
        <p style={styles.subtitle}>
          You have complete control over your data
        </p>

        {/* MASTER CONTROL */}
        <div style={styles.masterCard}>
          <div>
            <h2 style={styles.cardTitle}>Master Privacy Control</h2>
            <p style={styles.cardDesc}>
              Enable/disable application tracking and wellness insights only. Camera usage stays as a separate setting.
            </p>
          </div>

          <div style={styles.toggleRow}>
            <span>WorkGuard Monitoring</span>
            <ToggleSwitch
              value={consent.trackingEnabled && consent.wellnessEnabled}
              onChange={() => {
                const newState = !(consent.trackingEnabled && consent.wellnessEnabled);
                setConsent((prev) => ({
                  ...prev,
                  trackingEnabled: newState,
                  wellnessEnabled: newState,
                  // Camera remains unaffected by master privacy toggle
                }));
              }}
            />
          </div>
        </div>

        {/* PRIVACY SETTINGS */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Privacy Settings</h2>

          <SettingRow
            label="Camera Usage"
            desc="For optional posture check and presence verification"
            value={consent.cameraEnabled}
            onChange={() => handleToggle("cameraEnabled")}
          />

          <SettingRow
            label="Application Tracking"
            desc="Track which applications you use during work"
            value={consent.trackingEnabled}
            onChange={() => handleToggle("trackingEnabled")}
          />

          <SettingRow
            label="Wellness Insights"
            desc="AI-powered suggestions for better work-life balance"
            value={consent.wellnessEnabled}
            onChange={() => handleToggle("wellnessEnabled")}
          />
        </div>

        {/* DATA RETENTION */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Data Retention</h2>
          <p style={styles.cardDesc}>
            How long should we keep your data?
          </p>

          <select
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
            style={styles.select}
          >
            <option>7 days</option>
            <option>30 days</option>
            <option>90 days</option>
            <option>1 year</option>
          </select>

          <p style={styles.retentionNote}>
            Data older than this period will be automatically deleted.
          </p>
          <p style={styles.retentionNote}>
            Current retention policy: <strong>{retention} ({parseInt(retention.split(' ')[0])} days)</strong>
          </p>
        </div>

        {/* TRANSPARENCY */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Data Collection Transparency</h2>

          <div style={styles.transparencyGrid}>
            <div>
              <h3 style={{ color: "#16a34a" }}>✔ What We Collect</h3>
              <ul style={styles.list}>
                <li>Active work session timestamps</li>
                <li>Application names (not content)</li>
                <li>Break duration and frequency</li>
                <li>Idle time detection</li>
                <li>Wellness metrics (with consent)</li>
              </ul>
            </div>

            <div>
              <h3 style={{ color: "#dc2626" }}>✖ What We NEVER Collect</h3>
              <ul style={styles.list}>
                <li>Keystrokes or typed content</li>
                <li>Screenshots or screen recordings</li>
                <li>Personal communications</li>
                <li>Browsing history or URLs</li>
                <li>Audio/video without explicit consent</li>
              </ul>
            </div>
          </div>
        </div>

        <button style={styles.saveBtn} onClick={handleSave}>
          Save Changes
        </button>

        {message && <p style={styles.message}>{message}</p>}
      </div>
    </div>
  );
};

const SettingRow = ({ label, desc, value, onChange }) => (
  <div style={styles.settingRow}>
    <div>
      <div style={styles.settingTitle}>{label}</div>
      <div style={styles.settingDesc}>{desc}</div>
    </div>
    <ToggleSwitch value={value} onChange={onChange} />
  </div>
);

const ToggleSwitch = ({ value, onChange }) => (
  <div
    onClick={onChange}
    style={{
      width: 48,
      height: 26,
      borderRadius: 20,
      background: value ? "#2563eb" : "#cbd5e1",
      position: "relative",
      cursor: "pointer",
      transition: "0.3s",
    }}
  >
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: "white",
        position: "absolute",
        top: 2,
        left: value ? 24 : 2,
        transition: "0.3s",
      }}
    />
  </div>
);

/* STYLES UNCHANGED */

const styles = {
  page: {
    background: "#f3f6fb",
    minHeight: "100vh",
    padding: "50px 0px",
  },
  container: {
    maxWidth: "100%",
    margin: "0 auto",
  },
  title: {
    fontSize: "28px",
    fontWeight: "700",
    marginBottom: "4px",
  },
  subtitle: {
    color: "#64748b",
    marginBottom: "35px",
  },
  masterCard: {
    background: "#e9eef8",
    padding: "30px",
    borderRadius: "18px",
    marginBottom: "30px",
  },
  card: {
    background: "white",
    padding: "30px",
    borderRadius: "18px",
    marginBottom: "30px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.05)",
  },
  cardTitle: {
    fontSize: "18px",
    fontWeight: "600",
    marginBottom: "10px",
  },
  cardDesc: {
    color: "#64748b",
    marginBottom: "20px",
  },
  toggleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  settingRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "18px 0",
    borderBottom: "1px solid #f1f5f9",
  },
  settingTitle: {
    fontWeight: "600",
  },
  settingDesc: {
    fontSize: "14px",
    color: "#64748b",
  },
  select: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    marginTop: "12px",
    fontSize: "14px",
    background: "#fff",
    outline: "none",
  },
  retentionNote: {
    marginTop: "10px",
    fontSize: "13px",
    color: "#94a3b8",
  },
  transparencyGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "60px",
  },
  list: {
    marginTop: "10px",
    paddingLeft: "18px",
    lineHeight: "1.8",
  },
  saveBtn: {
    padding: "12px 25px",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
  },
  message: {
    marginTop: "15px",
    fontWeight: "500",
  },
};

export default ConsentSetup;
