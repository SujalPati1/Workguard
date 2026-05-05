// server/routes/wellnessRoutes.js
const express        = require("express");
const router         = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  logWellnessEvent,
  finalizeWellness,
  getSessionWellness,
  getWellnessSessions,
} = require("../controllers/wellnessController");

// POST /api/wellness/event
// Log a single biometric event (yawn, drowsy, distracted, etc.)
router.post("/event", authMiddleware, logWellnessEvent);

// POST /api/wellness/session/finalize
// Persist final wellness score when session ends
router.post("/session/finalize", authMiddleware, finalizeWellness);

// GET /api/wellness/session/:sessionId
// Full event timeline for a session — used to draw the graph
router.get("/session/:sessionId", authMiddleware, getSessionWellness);

// GET /api/wellness/sessions/:empId
// List all past sessions with their finalWellnessScore — used for session list UI
router.get("/sessions/:empId", authMiddleware, getWellnessSessions);

module.exports = router;
