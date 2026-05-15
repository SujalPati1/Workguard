import React from "react";

const ToggleSwitch = ({ isOn, onToggle }) => {
  return (
    <div
      onClick={onToggle}
      style={{
        width: "100%",
        height: 50,
        borderRadius: 16,
        background: isOn
          ? "linear-gradient(135deg,#6366f1,#22d3ee)"
          : "#f3f4f6",
        display: "flex",
        alignItems: "center",
        justifyContent: isOn ? "flex-end" : "flex-start",
        padding: 6,
        cursor: "pointer",
        transition: "all 0.4s ease",
        boxShadow: isOn
          ? "0 12px 30px rgba(99,102,241,0.35)"
          : "inset 0 0 0 1px #d1d5db",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          color: isOn ? "#6366f1" : "#ef4444",
          transition: "all 0.3s ease",
        }}
      >
        {isOn ? "ON" : "OFF"}
      </div>
    </div>
  );
};

export default ToggleSwitch;