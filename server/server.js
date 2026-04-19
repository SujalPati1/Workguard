const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();

// CORS configuration for Electron + Web
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
  ], // Vite dev server + admin app + Electron
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ MongoDB Error:", err));

// Routes
app.use(require("./routes/authRoutes"));
app.use(require("./routes/consentRoutes"));

// Session management — /attendance/start, /stop, /resume, /checkpoint, etc.
app.use("/attendance", require("./routes/session.routes"));

// Work Report & Attendance Summary — /api/report/today/:empId, /summary/:empId, etc.
app.use("/api/report", require("./routes/reportRoutes"));

// Admin — /api/admin/employees
app.use("/api/admin", require("./routes/adminRoutes"));

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "Server is running" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);