import { Routes, Route, Navigate } from "react-router-dom";
import React from "react";

import Navbar          from "./components/Navbar.jsx";
import LivenessModal   from "./components/LivenessModal.jsx";
import Dashboard       from "./pages/Dashboard.jsx";
import Login           from "./pages/Login.jsx";
import Register        from "./pages/Register.jsx";
import ConsentSetup    from "./pages/ConsentSetup.jsx";
import WorkSession     from "./pages/WorkSession.jsx";
import WorkReport      from "./pages/WorkReport.jsx";
import AttendanceSummary from "./pages/AttendanceSummary.jsx";
import Testing         from "./pages/Testing.jsx";

import { useSession } from "./context/SessionContext.jsx";

const PrivateRoute = ({ children }) => {
  const { employee } = useSession();
  return employee ? children : <Navigate to="/login" />;
};

const LoginRoute = ({ element: Element }) => {
  const { employee } = useSession();
  return employee ? <Navigate to="/dashboard" /> : Element;
};

const CatchAllRoute = () => {
  const { employee } = useSession();
  return employee ? <Navigate to="/dashboard" /> : <Navigate to="/login" />;
};

const App = () => {
  const {
    employee,
    livenessModalOpen,
    currentLivenessSlot,
    livenessResponseWindowMs,
    handleLivenessVerified,
    handleLivenessTimeout,
  } = useSession();

  const showSidebar = !!employee;

  return (
    <div style={{ display: "flex" }}>

      {/* LEFT SIDEBAR — only shown when logged in */}
      {showSidebar && <Navbar />}

      {/* RIGHT CONTENT AREA */}
      <div
        style={{
          marginLeft: showSidebar ? "250px" : "0",
          width: "100%",
          minHeight: "100vh",
          backgroundColor: showSidebar ? "#f1f5f9" : "transparent",
          padding: showSidebar ? "30px 40px" : "0",
        }}
      >
        <Routes>
          <Route path="/"          element={<Navigate to="/login" />} />
          <Route path="/login"     element={<LoginRoute element={<Login />} />} />
          <Route path="/register"  element={<LoginRoute element={<Register />} />} />

          <Route path="/dashboard"
            element={<PrivateRoute><Dashboard /></PrivateRoute>}
          />
          <Route path="/consent"
            element={<PrivateRoute><ConsentSetup /></PrivateRoute>}
          />
          <Route path="/session"
            element={<PrivateRoute><WorkSession /></PrivateRoute>}
          />
          <Route path="/report"
            element={<PrivateRoute><WorkReport /></PrivateRoute>}
          />
          <Route path="/attendance-summary"
            element={<PrivateRoute><AttendanceSummary /></PrivateRoute>}
          />
          <Route path="/testing"
            element={<PrivateRoute><Testing /></PrivateRoute>}
          />

          {/* /liveness and /wellness removed — engine runs invisibly */}
          <Route path="*" element={<CatchAllRoute />} />
        </Routes>
      </div>

      {/* GLOBAL LIVENESS MODAL — overlays every page */}
      {livenessModalOpen && (
        <LivenessModal
          slotIndex={currentLivenessSlot}
          responseWindowMs={livenessResponseWindowMs}
          onStart={() => {
            if (typeof window !== 'undefined' && window.electronAPI) {
              window.electronAPI.engine.requestLiveness();
            }
          }}
          onVerified={handleLivenessVerified}
          onTimeout={handleLivenessTimeout}
        />
      )}
    </div>
  );
};

export default App;
