const Session = require("../models/Session.model");
const User = require("../models/User");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive attendance result from active seconds.
 * Thresholds can be driven by env vars — fall back to sensible defaults.
 *   PRESENT  : activeSeconds >= 4 hours (14 400 s)
 *   PARTIAL  : activeSeconds >= 2 hours (7 200 s)
 *   ABSENT   : below partial threshold
 */
const PRESENT_THRESHOLD = parseInt(process.env.PRESENT_ACTIVE_SECONDS || "14400", 10);
const PARTIAL_THRESHOLD = parseInt(process.env.PARTIAL_ACTIVE_SECONDS || "7200", 10);

const deriveAttendanceResult = (activeSeconds) => {
  if (activeSeconds >= PRESENT_THRESHOLD) return "PRESENT";
  if (activeSeconds >= PARTIAL_THRESHOLD) return "PARTIAL";
  return "ABSENT";
};

/**
 * Compute burnout risk based on active/break ratio.
 *   HIGH    : < 10 % break out of active+break
 *   MEDIUM  : 10–25 %
 *   LOW     : > 25 %
 */
const deriveBurnoutRisk = (activeSeconds, breakSeconds) => {
  const total = activeSeconds + breakSeconds;
  if (total === 0) return "LOW";
  const breakRatio = breakSeconds / total;
  if (breakRatio < 0.1) return "HIGH";
  if (breakRatio < 0.25) return "MEDIUM";
  return "LOW";
};

/**
 * Focus score = activeTime / totalDuration * 100
 */
const deriveFocusScore = (activeSeconds, totalDuration) => {
  if (!totalDuration || totalDuration <= 0) return 0;
  return Math.min(100, Math.round((activeSeconds / totalDuration) * 100));
};

/**
 * Productivity score = (activeTime + waitingTime) / totalDuration * 100
 * (waiting is intentional time, not idle)
 */
const deriveProductivityScore = (activeSeconds, waitingSeconds, totalDuration) => {
  if (!totalDuration || totalDuration <= 0) return 0;
  return Math.min(
    100,
    Math.round(((activeSeconds + waitingSeconds) / totalDuration) * 100)
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/report/today/:empId
// @desc    Get today's aggregated work report for an employee
// @access  Private (authMiddleware applied in routes)
// ─────────────────────────────────────────────────────────────────────────────
exports.getTodayReport = async (req, res) => {
  try {
    const { empId } = req.params;

    if (!empId) {
      return res.status(400).json({ success: false, message: "empId is required" });
    }

    // Verify user exists
    const user = await User.findOne({ empId }).select("-password -refreshToken");
    if (!user) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    // Today's date window
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch today's COMPLETED sessions
    const sessions = await Session.find({
      empId,
      attendanceStatus: "COMPLETED",
      startTime: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ startTime: 1 });

    // Also check for an IN_PROGRESS session today
    const liveSession = await Session.findOne({
      empId,
      attendanceStatus: "IN_PROGRESS",
      startTime: { $gte: startOfDay, $lte: endOfDay },
    });

    // Aggregate across all completed sessions
    let totalActive = 0;
    let totalIdle = 0;
    let totalWaiting = 0;
    let totalBreak = 0;
    let totalDuration = 0;

    sessions.forEach((s) => {
      totalActive += s.activeTime || 0;
      totalIdle += s.idleTime || 0;
      totalWaiting += s.waitingTime || 0;
      totalBreak += s.breakTime || 0;
      totalDuration += s.totalDuration || 0;
    });

    // Derive earliest start and latest end across all sessions today
    const sessionStart = sessions.length > 0 ? sessions[0].startTime : null;
    const sessionEnd =
      sessions.length > 0 ? sessions[sessions.length - 1].endTime : null;

    const focusScore = deriveFocusScore(totalActive, totalDuration);
    const productivityScore = deriveProductivityScore(
      totalActive,
      totalWaiting,
      totalDuration
    );
    const burnoutRisk = deriveBurnoutRisk(totalActive, totalBreak);
    const attendanceStatus = deriveAttendanceResult(totalActive);

    return res.status(200).json({
      success: true,
      empId,
      fullName: user.fullName,
      department: user.department,
      date: new Date().toISOString().slice(0, 10),
      sessionStart,
      sessionEnd,
      sessionCount: sessions.length,
      hasLiveSession: !!liveSession,
      liveSessionId: liveSession?._id || null,

      // Raw time values (seconds)
      totalLoggedTime: totalDuration,
      activeTime: totalActive,
      idleTime: totalIdle,
      waitingTime: totalWaiting,
      breakTime: totalBreak,
      focusTime: sessions.filter((s) => s.focusMode).reduce(
        (acc, s) => acc + (s.totalDuration || 0),
        0
      ),

      // Derived scores
      focusScore,
      productivityScore,
      burnoutRisk,
      attendanceStatus,

      // Full sessions list for drilling down
      sessions,
    });
  } catch (err) {
    console.error("getTodayReport error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error generating today's report",
      error: err.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/report/summary/:empId
// @desc    Attendance summary for the last N months (default 3)
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.getAttendanceSummary = async (req, res) => {
  try {
    const { empId } = req.params;
    const months = parseInt(req.query.months || "3", 10);

    if (!empId) {
      return res.status(400).json({ success: false, message: "empId is required" });
    }

    // Verify user exists
    const user = await User.findOne({ empId }).select("-password -refreshToken");
    if (!user) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    // Date range: start of N months ago → now
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    since.setHours(0, 0, 0, 0);

    const sessions = await Session.find({
      empId,
      attendanceStatus: "COMPLETED",
      startTime: { $gte: since },
    }).sort({ startTime: -1 }); // newest first

    if (sessions.length === 0) {
      return res.status(200).json({
        success: true,
        empId,
        fullName: user.fullName,
        period: `Last ${months} months`,
        attendancePercent: 0,
        totalDays: 0,
        presentDays: 0,
        partialDays: 0,
        absentDays: 0,
        totals: {
          totalActive: 0,
          totalIdle: 0,
          totalWaiting: 0,
          totalBreak: 0,
          totalDuration: 0,
        },
        sessions: [],
      });
    }

    // ── Group sessions by calendar day ─────────────────────────────────────
    const dayMap = {}; // key: "YYYY-MM-DD"

    sessions.forEach((s) => {
      const dayKey = new Date(s.startTime).toISOString().slice(0, 10);
      if (!dayMap[dayKey]) {
        dayMap[dayKey] = {
          date: dayKey,
          sessions: [],
          totalActive: 0,
          totalIdle: 0,
          totalWaiting: 0,
          totalBreak: 0,
          totalDuration: 0,
        };
      }
      dayMap[dayKey].sessions.push(s);
      dayMap[dayKey].totalActive += s.activeTime || 0;
      dayMap[dayKey].totalIdle += s.idleTime || 0;
      dayMap[dayKey].totalWaiting += s.waitingTime || 0;
      dayMap[dayKey].totalBreak += s.breakTime || 0;
      dayMap[dayKey].totalDuration += s.totalDuration || 0;
    });

    // ── Per-day attendance result ───────────────────────────────────────────
    let presentDays = 0;
    let partialDays = 0;
    let absentDays = 0;
    let totalActive = 0;
    let totalIdle = 0;
    let totalWaiting = 0;
    let totalBreak = 0;
    let totalDuration = 0;

    const dailyResults = Object.values(dayMap).map((day) => {
      const result = deriveAttendanceResult(day.totalActive);
      if (result === "PRESENT") presentDays++;
      else if (result === "PARTIAL") partialDays++;
      else absentDays++;

      totalActive += day.totalActive;
      totalIdle += day.totalIdle;
      totalWaiting += day.totalWaiting;
      totalBreak += day.totalBreak;
      totalDuration += day.totalDuration;

      return {
        date: day.date,
        result,
        totalActive: day.totalActive,
        totalIdle: day.totalIdle,
        totalWaiting: day.totalWaiting,
        totalBreak: day.totalBreak,
        totalDuration: day.totalDuration,
        sessionCount: day.sessions.length,
        focusScore: deriveFocusScore(day.totalActive, day.totalDuration),
      };
    });

    const totalDays = Object.keys(dayMap).length;
    // Attendance % = (present + 0.5 * partial) / totalDays * 100
    const attendancePercent =
      totalDays > 0
        ? Math.round(((presentDays + partialDays * 0.5) / totalDays) * 100)
        : 0;

    // ── Build the "recent sessions" list the UI expects ─────────────────────
    // Map Session model field names → what WorkReport.jsx reads
    const recentSessions = sessions.slice(0, 20).map((s) => ({
      _id: s._id,
      sessionStart: s.startTime,
      sessionEnd: s.endTime,
      activeSeconds: s.activeTime || 0,
      idleSeconds: s.idleTime || 0,
      waitingSeconds: s.waitingTime || 0,
      breakSeconds: s.breakTime || 0,
      workStatus: s.workStatus,
      attendanceResult: s.attendanceResult,
      focusMode: s.focusMode,
      outcomeNote: null, // reserved for future notes feature
    }));

    return res.status(200).json({
      success: true,
      empId,
      fullName: user.fullName,
      period: `Last ${months} months`,
      attendancePercent,
      totalDays,
      presentDays,
      partialDays,
      absentDays,
      totals: {
        totalActive,
        totalIdle,
        totalWaiting,
        totalBreak,
        totalDuration,
      },
      dailyBreakdown: dailyResults,
      sessions: recentSessions,
    });
  } catch (err) {
    console.error("getAttendanceSummary error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching attendance summary",
      error: err.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/report/history/:empId
// @desc    Paginated full session history
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.getSessionHistory = async (req, res) => {
  try {
    const { empId } = req.params;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "10", 10)));
    const skip = (page - 1) * limit;

    if (!empId) {
      return res.status(400).json({ success: false, message: "empId is required" });
    }

    const user = await User.findOne({ empId }).select("fullName department");
    if (!user) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    const total = await Session.countDocuments({ empId, attendanceStatus: "COMPLETED" });

    const sessions = await Session.find({ empId, attendanceStatus: "COMPLETED" })
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "startTime endTime totalDuration activeTime idleTime waitingTime breakTime focusMode workStatus attendanceResult attendanceStatus"
      );

    return res.status(200).json({
      success: true,
      empId,
      fullName: user.fullName,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      sessions,
    });
  } catch (err) {
    console.error("getSessionHistory error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching session history",
      error: err.message,
    });
  }
};
