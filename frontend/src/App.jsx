import { Routes, Route, Navigate } from "react-router-dom";
import React from "react";

import Navbar from "./components/Navbar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Login from "./pages/Login.jsx";
import ConsentSetup from "./pages/ConsentSetup.jsx";
import WorkSession from "./pages/WorkSession.jsx";
import WorkReport from "./pages/WorkReport.jsx";
import AttendanceSummary from "./pages/AttendanceSummary.jsx";

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
  return (
    <div style={{ display: "flex" }}>
      
      {/* LEFT SIDEBAR */}
      <Navbar />

      {/* RIGHT CONTENT AREA */}
      <div
        style={{
          marginLeft: "250px",   // same width as sidebar
          width: "100%",
          minHeight: "100vh",
          backgroundColor: "#f1f5f9",
          padding: "30px 40px",
        }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<LoginRoute element={<Login />} />} />

          <Route
            path="/dashboard"
            element={<PrivateRoute><Dashboard /></PrivateRoute>}
          />

          <Route
            path="/consent"
            element={<PrivateRoute><ConsentSetup /></PrivateRoute>}
          />

          <Route
            path="/session"
            element={<PrivateRoute><WorkSession /></PrivateRoute>}
          />

          <Route
            path="/report"
            element={<PrivateRoute><WorkReport /></PrivateRoute>}
          />

          <Route
            path="/attendance-summary"
            element={<PrivateRoute><AttendanceSummary /></PrivateRoute>}
          />

          <Route path="*" element={<CatchAllRoute />} />
        </Routes>
      </div>
    </div>
  );
};


export default App;
