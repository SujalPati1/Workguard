const router = require("express").Router();
const {
  startSession,
  resumeSession,
  checkpoint,
  stopSession,
  getSummary,
  getActiveSession,
  pauseSession,
} = require("../controllers/attendanceController");

// Session management
router.post("/attendance/start", startSession);
router.post("/attendance/resume", resumeSession);
router.post("/attendance/checkpoint", checkpoint);
router.post("/attendance/stop", stopSession);
router.post("/attendance/pause", pauseSession);

// Session queries
router.get("/attendance/summary/:empId", getSummary);
router.get("/session/resume/:empId", getActiveSession); // Alternative route for direct fetch calls

module.exports = router;
