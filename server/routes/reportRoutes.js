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

// GET /api/report/today/:empId
router.get("/today/:empId", authMiddleware, getTodayReport);

// GET /api/report/summary/:empId?months=3
router.get("/summary/:empId", authMiddleware, getAttendanceSummary);

// GET /api/report/history/:empId?page=1&limit=10
router.get("/history/:empId", authMiddleware, getSessionHistory);

module.exports = router;
