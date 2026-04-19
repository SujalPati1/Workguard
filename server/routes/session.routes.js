const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
  startSession,
  stopSession,
  resumeSession,
  checkpoint,
  getTodayReport,
  getSessionById,
} = require("../controllers/session.controller");

// All session endpoints require a valid JWT.
// empId is still accepted from the request body so existing frontend clients
// continue to work — the JWT only proves the caller is a known user.
router.post("/start",      authMiddleware, startSession);
router.post("/stop",       authMiddleware, stopSession);
router.post("/resume",     authMiddleware, resumeSession);
router.post("/checkpoint", authMiddleware, checkpoint);

// Session report endpoints — also protected
router.get("/report/today/:empId", authMiddleware, getTodayReport);
router.get("/:sessionId",          authMiddleware, getSessionById);

module.exports = router;
