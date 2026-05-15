import React from "react";

const StatCard = ({ title, value, sub }) => {
  return (
    <div className="wg-card">
      <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 800 }}>
        {title}
      </div>

      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 10 }}>
        {value}
      </div>

      {sub && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
};

export default StatCard;
