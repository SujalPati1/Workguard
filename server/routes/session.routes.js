const express = require("express");
const router = express.Router();

const {
  startSession,
  stopSession,
  resumeSession,
  checkpoint,
  getTodayReport,
  getSessionById,
} = require("../controllers/session.controller");

// Session Management Endpoints
router.post("/start", startSession);
router.post("/stop", stopSession);
router.post("/resume", resumeSession);
router.post("/checkpoint", checkpoint);

// Session Report Endpoints
router.get("/report/today/:empId", getTodayReport);
router.get("/:sessionId", getSessionById);

module.exports = router;



