import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSession } from "../context/SessionContext.jsx";
import { registerEmployee } from "../api/authApi";
import { motion, AnimatePresence } from "framer-motion";

const Register = () => {
  const [empId, setEmpId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");

  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState("");
  const [theme, setTheme] = useState("dark");
  const [bgIndex, setBgIndex] = useState(0);

  const navigate = useNavigate();
  const { login, isAuthenticated } = useSession();

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  // Background slideshow
  const soothingBgs = useMemo(
    () => [
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1920&q=90",
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1920&q=90",
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=90",
    ],
    []
  );

  useEffect(() => {
    soothingBgs.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [soothingBgs]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % soothingBgs.length);
    }, 9500);
    return () => clearInterval(interval);
  }, [soothingBgs.length]);

  const handleRegister = async (e) => {
    e.preventDefault();

    // Validation
    if (!empId.trim() || !email.trim() || !password.trim()) {
      setMsg("❌ Please fill in all required fields");
      return;
    }

    if (password.length < 6) {
      setMsg("❌ Password must be at least 6 characters");
      return;
    }

    try {
      setMsg("🔐 Creating account...");

      const response = await registerEmployee(
        empId.trim(),
        email.trim(),
        password,
        fullName.trim(),
        department.trim()
      );

      if (!response.success) {
        setMsg("❌ " + (response.message || "Registration failed"));
        return;
      }

      // Store tokens and employee data
      login(response.employee, response.accessToken, response.refreshToken);

      setMsg("✅ Registration successful! Redirecting...");

      setTimeout(() => {
        navigate("/dashboard");
      }, 800);
    } catch (err) {
      console.error("Register error:", err);
      setMsg("❌ " + (err.response?.data?.message || err.message || "Registration failed"));
    }
  };

  return (
    <div className={`wg-login-hero ${theme === "light" ? "wg-light" : ""}`}>
      {/* Background */}
      <div className="wg-bg-holder">
        <AnimatePresence mode="wait">
          <motion.div
            key={bgIndex}
            className="wg-bg-slide"
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1.02 }}
            exit={{ opacity: 0, scale: 1.12 }}
            transition={{ duration: 2.1, ease: "easeInOut" }}
            style={{
              backgroundImage: `url(${soothingBgs[bgIndex]})`,
            }}
          />
        </AnimatePresence>
        <div className="wg-bg-overlay" />
      </div>

      <div className="wg-login-wrapper">
        {/* LEFT PANEL */}
        <motion.div
          className="wg-login-left"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className="wg-top-row">
            <div className="wg-brand">
              <div className="wg-brand-logo">WG</div>
              <div>
                <h1 className="wg-brand-title">WorkGuard</h1>
                <p className="wg-brand-sub">Employee Workspace</p>
              </div>
            </div>

            <button
              className="wg-theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              type="button"
              title="Toggle Theme"
            >
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>

          <h2 className="wg-greeting">Join WorkGuard 🎯</h2>
          <p className="wg-motivation">
            Create your account to start working with enhanced focus and productivity.
          </p>

          <div className="wg-quote">
            "Start your journey with security and transparency."
          </div>

          <motion.div
            className="wg-secure-card"
            whileHover={{ y: -3 }}
            transition={{ duration: 0.25 }}
          >
            <div className="wg-secure-icon">
              <div className="wg-avatar">
                <div className="wg-avatar-head"></div>
                <div className="wg-avatar-body"></div>
              </div>
            </div>

            <div>
              <p className="wg-secure-title">Safe & Secure</p>
              <p className="wg-secure-sub">
                Password protected • Enterprise-grade security
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* RIGHT PANEL */}
        <motion.div
          className="wg-login-right"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, ease: "easeOut", delay: 0.05 }}
        >
          <motion.div
            className="wg-glass-card"
            whileHover={{ y: -2 }}
            transition={{ duration: 0.25 }}
          >
            <h2 className="wg-title">Create Account</h2>
            <p className="wg-subtitle">Fill in your details to get started.</p>

            <form className="wg-form" onSubmit={handleRegister}>
              <div className="wg-field">
                <label className="wg-label">Employee ID *</label>
                <input
                  className="wg-input"
                  placeholder="EMP101"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  required
                />
              </div>

              <div className="wg-field">
                <label className="wg-label">Full Name</label>
                <input
                  className="wg-input"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="wg-field">
                <label className="wg-label">Email *</label>
                <input
                  className="wg-input"
                  placeholder="john@company.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="wg-field">
                <label className="wg-label">Department</label>
                <input
                  className="wg-input"
                  placeholder="Engineering"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>

              <div className="wg-field">
                <label className="wg-label">Password *</label>
                <div className="wg-pass-wrap">
                  <input
                    className="wg-input wg-pass-input"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPass ? "text" : "password"}
                    required
                  />

                  <button
                    type="button"
                    className="wg-eye-btn"
                    onClick={() => setShowPass(!showPass)}
                    title={showPass ? "Hide Password" : "Show Password"}
                  >
                    {showPass ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>

              <motion.button
                className="wg-btn-primary"
                type="submit"
                whileTap={{ scale: 0.98 }}
              >
                Create Account →
              </motion.button>
            </form>

            {msg && <p className="wg-msg">{msg}</p>}

            <div className="wg-tip-box">
              <div className="wg-tip-icon">ℹ️</div>
              <div>
                <p className="wg-tip-title">Already have an account?</p>
                <p className="wg-tip-text">
                  <Link to="/login" className="wg-link">
                    Login here →
                  </Link>
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <style>{`
        .wg-link {
          color: #4f46e5;
          text-decoration: none;
          font-weight: 600;
          transition: color 0.2s;
        }
        .wg-link:hover {
          color: #6366f1;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};

export default Register;
