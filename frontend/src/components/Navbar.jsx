import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../context/SessionContext";

const Navbar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { employee, logout } = useSession();

  const itemStyle = (path) => ({
    padding: "10px 24px",
    borderRadius: "10px",
    textDecoration: "none",
    fontSize: "16px",
    fontWeight: 500,
    color: pathname === path ? "#2563eb" : "#475569",
    background: pathname === path ? "#eaf2ff" : "transparent",
    transition: "0.2s",
    display: "block",
  });

  const handleLogout = () => {
    logout();
    navigate("/login"); // ensure redirect after logout
  };

  return (
    <div
      style={{
         position: "fixed",     
         left: 0,
        top: 0,
        width: "260px",
       height: "100vh",
       backgroundColor: "#f8fafc",
      borderRight: "1px solid #e2e8f0",
      padding: "24px 18px",
      boxSizing: "border-box",
        display: "flex",
     flexDirection: "column",
     justifyContent: "space-between",
  
      }}
    >
      {/* TOP SECTION */}
      <div>
        {/* Logo */}
        <div style={{ marginBottom: "30px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "#2563eb",
                color: "white",
                fontWeight: 800,
                display: "grid",
                placeItems: "center",
                fontSize: "14px",
              }}
            >
              WG
            </div>

            <div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "18px",
                  color: "#0f172a",
                  letterSpacing: "0.3px",
                }}
              >
                WorkGuard
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Productivity Suite
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Link to="/dashboard" style={itemStyle("/dashboard")}>
            Dashboard
          </Link>
          <Link to="/consent" style={itemStyle("/consent")}>
            Consent
          </Link>
          <Link to="/session" style={itemStyle("/session")}>
            Session
          </Link>
          <Link to="/report" style={itemStyle("/report")}>
            Report
          </Link>
          <Link
            to="/attendance-summary"
            style={itemStyle("/attendance-summary")}
          >
            Attendance
          </Link>
        </div>
      </div>

      {/* BOTTOM USER PROFILE SECTION */}
      {employee && (
        <div
          style={{
            borderTop: "1px solid #e2e8f0",
            paddingTop: "16px",
            marginTop: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Avatar */}
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                backgroundColor: "#e2e8f0",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                color: "#475569",
              }}
            >
              {employee?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>

            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "14px",
                  color: "#0f172a",
                }}
              >
                {employee?.name || "User"}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                Emp ID: {employee?.empId || "—"}
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            style={{
              marginTop: "12px",
              width: "100%",
              padding: "8px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#fee2e2",
              color: "#dc2626",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default Navbar;
