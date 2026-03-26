import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../context/SessionContext.jsx";
import { loginEmployee } from "../api/authApi";
import { motion, AnimatePresence } from "framer-motion";

const Login = () => {
  const [empId, setEmpId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [msg, setMsg] = useState("");

  const [theme, setTheme] = useState("dark");
  const [bgIndex, setBgIndex] = useState(0);

  const navigate = useNavigate();
  const { login } = useSession();

  // ✅ Soothing background images
  const soothingBgs = useMemo(
    () => [
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1920&q=90",
      "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1920&q=90",
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=90",
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1920&q=90",
      "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1920&q=90",
      "https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?auto=format&fit=crop&w=1920&q=90",
    ],
    []
  );

  // ✅ Preload images (prevents flicker)
  useEffect(() => {
    soothingBgs.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [soothingBgs]);

  // ✅ Greeting message
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning 👋";
    if (hour < 17) return "Good Afternoon 👋";
    return "Good Evening 👋";
  }, []);

  // ✅ Smooth slideshow
  useEffect(() => {
    const interval = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % soothingBgs.length);
    }, 9500);
    return () => clearInterval(interval);
  }, [soothingBgs.length]);

  // ✅ Load saved theme + remember details
  useEffect(() => {
    const savedTheme = localStorage.getItem("wg_theme");
    if (savedTheme) setTheme(savedTheme);

    const savedRemember = localStorage.getItem("wg_rememberMe");
    if (savedRemember) setRememberMe(savedRemember === "true");

    const savedEmpId = localStorage.getItem("wg_empId");
    const savedEmail = localStorage.getItem("wg_email");

    if (savedEmpId) setEmpId(savedEmpId);
    if (savedEmail) setEmail(savedEmail);
  }, []);

  useEffect(() => {
    localStorage.setItem("wg_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("wg_rememberMe", rememberMe.toString());
    if (rememberMe) {
      localStorage.setItem("wg_empId", empId);
      localStorage.setItem("wg_email", email);
    } else {
      localStorage.removeItem("wg_empId");
      localStorage.removeItem("wg_email");
    }
  }, [rememberMe, empId, email]);

  // ✅ Login handler
  const handleLogin = async (e) => {
    e.preventDefault();

    // Validation
    if (!empId.trim() || !password.trim()) {
      setMsg("❌ Please enter Employee ID and password");
      return;
    }

    try {
      setMsg("🔐 Logging in...");

      const response = await loginEmployee(email.trim() || undefined, password, empId.trim());
      console.log(response)

      if (!response.success) {
        setMsg("❌ " + (response.message || "Login failed"));
        return;
      }

      // Store tokens and employee data
      login(response.employee, response.accessToken, response.refreshToken);

      setMsg("✅ Login successful! Redirecting...");
      
      // Redirect after brief delay
      setTimeout(() => {
        navigate("/dashboard");
      }, 800);
    } catch (err) {
      console.error("Login error:", err);
      setMsg("❌ " + (err.response?.data?.message || err.message || "Login failed"));
    }
  };

  const handleForgotId = () => {
    alert(
      "📩 Please contact HR/Admin to recover your Employee ID.\n\nTip: It looks like EMP101."
    );
  };

  return (
    <div className={`wg-login-hero ${theme === "light" ? "wg-light" : ""}`}>
      {/* ✅ Dynamic Background Slideshow */}
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

          <h2 className="wg-greeting">{greeting}</h2>
          <p className="wg-motivation">
            Ready to start your work with focus, confidence, and calm.
          </p>

          <div className="wg-quote">
            “Start your day with clarity, not surveillance.”
          </div>

          {/* ✅ Secure Login Box (bigger height) */}
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
              <p className="wg-secure-title">Secure Login</p>
              <p className="wg-secure-sub">
                Smooth access • Minimal distractions
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
            <h2 className="wg-title">Employee Login</h2>
            <p className="wg-subtitle">
              Please login using your Employee ID & credentials.
            </p>

            <form className="wg-form" onSubmit={handleLogin}>
              <div className="wg-field">
                <label className="wg-label">Employee ID</label>
                <input
                  className="wg-input"
                  placeholder="EMP101"
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
                  required
                />
              </div>

              <div className="wg-field">
                <label className="wg-label">Email (optional)</label>
                <input
                  className="wg-input"
                  placeholder="example@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="wg-field">
                <label className="wg-label">Password</label>
                <div className="wg-pass-wrap">
                  <input
                    className="wg-input wg-pass-input"
                    placeholder="Enter your password"
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

              <div className="wg-row-between">
                <label className="wg-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  Remember me
                </label>

                <button
                  type="button"
                  className="wg-link-btn"
                  onClick={handleForgotId}
                >
                  Forgot Employee ID?
                </button>
              </div>

              <motion.button
                className="wg-btn-primary"
                type="submit"
                whileTap={{ scale: 0.98 }}
              >
                Login →
              </motion.button>
            </form>

            {msg && <p className="wg-msg">{msg}</p>}

            {/* ✅ Better Tip section */}
            <div className="wg-tip-box">
              <div className="wg-tip-icon">💡</div>
              <div>
                <p className="wg-tip-title">Tip</p>
                <p className="wg-tip-text">
                  Use the Employee ID provided by HR.
                  <br></br>
                  For password issues, contact admin.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* ✅ Final CSS */}
      <style>{`
        .wg-login-hero{
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:28px;
          position:relative;
          overflow:hidden;
          font-family: "Times New Roman", Times, serif;
        }

        /* Background */
        .wg-bg-holder{
          position:absolute;
          inset:0;
          z-index:0;
          overflow:hidden;
        }

        .wg-bg-slide{
          position:absolute;
          inset:0;
          background-size:cover;
          background-position:center;
          filter:saturate(1.15) contrast(1.1) brightness(1.02);
        }

        .wg-bg-overlay{
          position:absolute;
          inset:0;
          background:
            radial-gradient(circle at 20% 20%, rgba(99,102,241,0.20), transparent 40%),
            radial-gradient(circle at 80% 80%, rgba(34,197,94,0.18), transparent 42%),
            linear-gradient(120deg, rgba(2,6,23,0.86), rgba(2,6,23,0.55), rgba(2,6,23,0.88));
        }

        /* Layout */
        .wg-login-wrapper{
          width:min(1140px, 100%);
          display:grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap:26px;
          position:relative;
          z-index:2;
        }

        @media(max-width: 980px){
          .wg-login-wrapper{ grid-template-columns:1fr; }
        }

        /* Panels */
        .wg-login-left,
        .wg-glass-card{
          border-radius:24px;
          background: rgba(255,255,255,0.14);
          border: 1px solid rgba(255,255,255,0.22);
          box-shadow: 0 35px 95px rgba(0,0,0,0.55);
          backdrop-filter: blur(18px);
        }

        .wg-login-left{
          padding:30px;
        }

        .wg-login-right{
          display:flex;
          align-items:center;
          justify-content:center;
        }

        .wg-glass-card{
          width:100%;
          max-width:470px;
          padding:28px;
        }

        /* Top row */
        .wg-top-row{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
          margin-bottom:18px;
        }

        .wg-brand{
          display:flex;
          align-items:center;
          gap:12px;
        }

        .wg-brand-logo{
          width:52px;
          height:52px;
          border-radius:18px;
          display:grid;
          place-items:center;
          font-weight:900;
          color:#06101f;
          background: linear-gradient(135deg, #60a5fa, #a78bfa, #34d399);
          box-shadow: 0 14px 34px rgba(0,0,0,0.50);
        }

        .wg-brand-title{
          margin:0;
          font-family: 'Times New Roman', Times, serif;
          font-size:22px;
          font-weight:900;
          color: rgba(255,255,255,0.98);
        }

        .wg-brand-sub{
          margin:4px 0 0;
          color: rgba(255,255,255,0.75);
          font-weight:700;
          font-size:13px;
        }

        .wg-theme-toggle{
          border: 1px solid rgba(255,255,255,0.20);
          background: rgba(0,0,0,0.34);
          color: rgba(255,255,255,0.95);
          padding:10px 14px;
          border-radius:16px;
          font-weight:900;
          cursor:pointer;
          transition:0.25s ease;
        }

        .wg-theme-toggle:hover{
          transform: translateY(-1px);
        }

        /* Left content */
        .wg-greeting{
          font-size:40px;
          font-weight:900;
          margin:10px 0 12px;
          color: rgba(255,255,255,0.99);
          text-shadow: 0 2px 12px rgba(0,0,0,0.55);
        }

        .wg-motivation{
          margin:0 0 18px;
          line-height:1.65;
          color: rgba(255,255,255,0.88);
          font-size:22px;
          text-shadow: 0 2px 10px rgba(0,0,0,0.40);
        }

        .wg-quote{
          padding:12px 16px;
          border-radius:16px;
          background: rgba(0,0,0,0.36);
          border: 1px solid rgba(255,255,255,0.18);
          color: rgba(255,255,255,0.95);
          font-style: italic;
          font-weight:800;
          font-size:20px;
          width: fit-content;
          margin-bottom:18px;
        }

        /* Secure card (bigger) */
        .wg-secure-card{
          min-height: 130px;
          display:flex;
          align-items:center;
          gap:14px;
          padding:18px;
          border-radius:20px;
          background: rgba(0,0,0,0.26);
          border: 1px solid rgba(255,255,255,0.18);
        }

        .wg-secure-icon{
          width:82px;
          height:82px;
          border-radius:22px;
          display:grid;
          place-items:center;
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.18);
        }

        .wg-secure-title{
          margin:0;
          font-weight:900;
          color: rgba(255,255,255,0.98);
          font-size:16px;
        }

        .wg-secure-sub{
          margin:6px 0 0;
          color: rgba(255,255,255,0.82);
          font-weight:700;
          font-size:16px;
        }

        /* Avatar */
        .wg-avatar{
          width:56px;
          height:56px;
          border-radius:18px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.16);
          position:relative;
        }

        .wg-avatar-head{
          width:18px;
          height:18px;
          border-radius:50%;
          background: linear-gradient(135deg, #60a5fa, #a78bfa);
          position:absolute;
          top:12px;
          left:50%;
          transform: translateX(-50%);
        }

        .wg-avatar-body{
          width:30px;
          height:20px;
          border-radius:16px;
          background: linear-gradient(135deg, #34d399, #60a5fa);
          position:absolute;
          top:28px;
          left:50%;
          transform: translateX(-50%);
        }

        /* Right side */
        .wg-title{
          margin:0;
          font-size:23px;
          font-weight:900;
          color: rgba(255,255,255,0.98);
        }

        .wg-subtitle{
          margin-top:6px;
          margin-bottom:18px;
          color: rgba(255,255,255,0.82);
          font-weight:700;
          font-size:18px;
        }

        .wg-form{
          display:grid;
          gap:14px;
          
        }

        .wg-label{
          font-size:17.5px;
          font-weight:800;
          color: rgba(255,255,255,0.90);
        }

        .wg-input{
          width:100%;
          padding:12px 14px;
          border-radius:16px;
          border: 1px solid rgba(255,255,255,0.20);
          background: rgba(0,0,0,0.32);
          color: rgba(255,255,255,0.96);
          outline:none;
          transition:0.25s ease;
        }

        .wg-input:focus{
          border-color: rgba(96,165,250,0.98);
          box-shadow: 0 0 0 5px rgba(96,165,250,0.26);
        }

        .wg-pass-wrap{
          position:relative;
          display:flex;
          align-items:center;
        }

        .wg-pass-input{ padding-right:48px; }

        .wg-eye-btn{
          position:absolute;
          right:10px;
          height:36px;
          width:38px;
          border-radius:14px;
          border: 1px solid rgba(255,255,255,0.20);
          background: rgba(0,0,0,0.30);
          color: rgba(255,255,255,0.95);
          cursor:pointer;
        }

        .wg-row-between{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          margin-top:2px;
        }

        .wg-remember{
          display:flex;
          align-items:center;
          gap:8px;
          color: rgba(255,255,255,0.88);
          font-weight:800;
          font-size:13px;
          cursor:pointer;
        }

        .wg-link-btn{
          border:none;
          background:transparent;
          padding:0;
          cursor:pointer;
          font-weight:900;
          font-size:13px;
          color: rgba(147,197,253,0.98);
        }

        .wg-link-btn:hover{
          text-decoration: underline;
        }

        .wg-btn-primary{
          margin-top:6px;
          width:100%;
          padding:13px 16px;
          border-radius:16px;
          border:none;
          font-weight:900;
          cursor:pointer;
          color:#08101f;
          background: linear-gradient(135deg, #60a5fa, #a78bfa, #34d399);
          box-shadow: 0 24px 60px rgba(0,0,0,0.45);
        }

        .wg-msg{
          margin-top:14px;
          font-weight:900;
          font-size:14px;
          color: rgba(255,255,255,0.95);
        }

        /* Tip box */
        .wg-tip-box{
          margin-top:14px;
          display:flex;
          gap:12px;
          align-items:flex-start;
          padding:14px;
          border-radius:20px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.34);
        }

        .wg-tip-icon{
          width:34px;
          height:34px;
          border-radius:14px;
          display:grid;
          place-items:center;
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.16);
        }

        .wg-tip-title{
          margin:0;
          font-weight:900;
          color: rgba(255,255,255,0.98);
        }

        .wg-tip-text{
          margin:4px 0 0;
          color: rgba(255,255,255,0.85);
          font-weight:700;
          font-size:15px;
          line-height:1.5;
        }

        /* ================================
           ✅ FIX: LIGHT MODE READABILITY
        ================================ */
        .wg-login-hero.wg-light .wg-bg-overlay{
          background:
            radial-gradient(circle at 20% 20%, rgba(99,102,241,0.14), transparent 42%),
            radial-gradient(circle at 80% 80%, rgba(34,197,94,0.10), transparent 45%),
            linear-gradient(120deg, rgba(255,255,255,0.78), rgba(255,255,255,0.58), rgba(255,255,255,0.82));
        }

        .wg-login-hero.wg-light .wg-login-left,
        .wg-login-hero.wg-light .wg-glass-card{
          background: rgba(255,255,255,0.92) !important;
          border: 1px solid rgba(0,0,0,0.08) !important;
          box-shadow: 0 25px 60px rgba(0,0,0,0.12) !important;
        }

        .wg-login-hero.wg-light .wg-brand-title,
        .wg-login-hero.wg-light .wg-greeting,
        .wg-login-hero.wg-light .wg-title{
          color: rgba(15,23,42,0.96) !important;
          text-shadow:none !important;
        }

        .wg-login-hero.wg-light .wg-brand-sub,
        .wg-login-hero.wg-light .wg-motivation,
        .wg-login-hero.wg-light .wg-subtitle,
        .wg-login-hero.wg-light .wg-label,
        .wg-login-hero.wg-light .wg-secure-title,
        .wg-login-hero.wg-light .wg-secure-sub{
          color: rgba(15,23,42,0.70) !important;
          text-shadow:none !important;
        }

        .wg-login-hero.wg-light .wg-quote{
          background: rgba(15,23,42,0.08) !important;
          border: 1px solid rgba(0,0,0,0.08) !important;
          color: rgba(15,23,42,0.88) !important;
        }

        .wg-login-hero.wg-light .wg-secure-card{
          background: rgba(15,23,42,0.06) !important;
          border: 1px solid rgba(0,0,0,0.08) !important;
        }

        .wg-login-hero.wg-light .wg-input{
          background: rgba(255,255,255,0.96) !important;
          border: 1px solid rgba(0,0,0,0.12) !important;
          color: rgba(15,23,42,0.92) !important;
        }

        .wg-login-hero.wg-light .wg-remember{
          color: rgba(15,23,42,0.70) !important;
        }

        .wg-login-hero.wg-light .wg-link-btn{
          color: rgba(37,99,235,0.95) !important;
        }

        .wg-login-hero.wg-light .wg-tip-box{
          background: rgba(255,255,255,0.95) !important;
          border: 1px solid rgba(0,0,0,0.10) !important;
        }

        .wg-login-hero.wg-light .wg-tip-title{
          color: rgba(15,23,42,0.92) !important;
        }

        .wg-login-hero.wg-light .wg-tip-text{
          color: rgba(15,23,42,0.70) !important;
        }
      `}</style>
    </div>
  );
};

export default Login;
