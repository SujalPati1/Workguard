const express = require("express");
const router  = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
  heartbeat,
  recordLiveness,
  markMissed,
  syncSessionTotals,
  getToday,
  getLivenessStatus,
} = require("../controllers/dailyActivityController");

// Heartbeat — called every 2 min while app is open to accumulate platform time
router.post("/heartbeat", authMiddleware, heartbeat);

// Liveness verification — called by Electron after biometric confirm
router.post("/liveness", authMiddleware, recordLiveness);

// Mark a liveness slot as MISSED (popup timed out, called by frontend)
router.post("/liveness/missed", authMiddleware, markMissed);

// Sync session productivity metrics into DailyActivity
router.post("/sync", authMiddleware, syncSessionTotals);

// Full daily record for dashboard (no empId needed — uses JWT)
router.get("/today", authMiddleware, getToday);

// Lightweight liveness schedule — used by frontend scheduler (no empId needed — uses JWT)
router.get("/liveness-status", authMiddleware, getLivenessStatus);

module.exports = router;
