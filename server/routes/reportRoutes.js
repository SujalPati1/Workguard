const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  getTodayReport,
  getAttendanceSummary,
  getSessionHistory,
} = require("../controllers/reportController");

// All report endpoints are protected — employee must be logged in.
// The empId in the param is cross-checked against the DB (User.findOne),
// so employees can only ever fetch their own data once the middleware
// confirms a valid JWT.

// GET /api/report/today
router.get("/today", authMiddleware, getTodayReport);

// GET /api/report/summary?months=3
router.get("/summary", authMiddleware, getAttendanceSummary);

// GET /api/report/history?page=1&limit=10
router.get("/history", authMiddleware, getSessionHistory);

module.exports = router;
