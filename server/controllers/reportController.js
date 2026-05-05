const Session = require("../models/Session.model");
const DailyActivity = require("../models/DailyActivity");
const User = require("../models/User");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
    const today = new Date().toISOString().slice(0, 10);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Get DailyActivity — the single source of truth for attendance
    const daily = await DailyActivity.findOne({ empId, date: today });

    // Fetch today's sessions for drill-down
    const sessions = await Session.find({
      empId,
      startTime: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ startTime: 1 });

    // Also check for an IN_PROGRESS session today
    const liveSession = await Session.findOne({
      empId,
      attendanceStatus: "IN_PROGRESS",
      startTime: { $gte: startOfDay, $lte: endOfDay },
    });

    // Use DailyActivity if it exists, else aggregate from sessions
    const totalActive = daily?.totalActiveTime || 0;
    const totalIdle = daily?.totalIdleTime || 0;
    const totalWaiting = daily?.totalWaitingTime || 0;
    const totalBreak = daily?.totalBreakTime || 0;
    const totalDuration = daily?.totalDuration || 0;

    const focusScore = deriveFocusScore(totalActive, totalDuration);
    const productivityScore = deriveProductivityScore(totalActive, totalWaiting, totalDuration);
    const burnoutRisk = deriveBurnoutRisk(totalActive, totalBreak);

    // Attendance comes from DailyActivity — NOT from session-level calculation
    const attendanceStatus = daily?.attendanceResult || "ABSENT";

    return res.status(200).json({
      success: true,
      empId,
      fullName: user.fullName,
      department: user.department,
      date: today,
      sessionStart: sessions.length > 0 ? sessions[0].startTime : null,
      sessionEnd: sessions.length > 0 ? sessions[sessions.length - 1].endTime : null,
      sessionCount: sessions.length,
      hasLiveSession: !!liveSession,
      liveSessionId: liveSession?._id || null,

      // Raw time values (seconds)
      totalLoggedTime: totalDuration,
      platformTime: daily?.totalPlatformTime || 0,
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

      // Liveness compliance (from DailyActivity)
      livenessSlots: daily?.livenessSlots || [],
      totalLivenessPassed: daily?.totalLivenessPassed || 0,
      complianceScore: daily?.complianceScore || 0,

      // Thresholds for progress calculation
      presentThreshold: parseInt(process.env.PRESENT_ACTIVE_SECONDS || "360", 10),
      partialThreshold: parseInt(process.env.PARTIAL_ACTIVE_SECONDS || "180", 10),

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
    const sinceDate = since.toISOString().slice(0, 10);

    // Get DailyActivity records for the date range
    const dailyRecords = await DailyActivity.find({
      empId,
      date: { $gte: sinceDate },
    }).sort({ date: -1 });

    if (dailyRecords.length === 0) {
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

    // ── Aggregate from DailyActivity records ─────────────────────────────
    let presentDays = 0;
    let partialDays = 0;
    let absentDays = 0;
    let totalActive = 0;
    let totalIdle = 0;
    let totalWaiting = 0;
    let totalBreak = 0;
    let totalDuration = 0;

    const dailyBreakdown = dailyRecords.map((day) => {
      const result = day.attendanceResult;
      if (result === "PRESENT") presentDays++;
      else if (result === "PARTIAL") partialDays++;
      else absentDays++;

      totalActive += day.totalActiveTime;
      totalIdle += day.totalIdleTime;
      totalWaiting += day.totalWaitingTime;
      totalBreak += day.totalBreakTime;
      totalDuration += day.totalDuration;

      return {
        date: day.date,
        result,
        totalActive: day.totalActiveTime,
        totalIdle: day.totalIdleTime,
        totalWaiting: day.totalWaitingTime,
        totalBreak: day.totalBreakTime,
        totalDuration: day.totalDuration,
        sessionCount: day.sessionCount,
        focusScore: day.averageFocusScore,
        complianceScore: day.complianceScore,
        totalLivenessPassed: day.totalLivenessPassed,
      };
    });

    const totalDays = dailyRecords.length;
    const attendancePercent =
      totalDays > 0
        ? Math.round(((presentDays + partialDays * 0.5) / totalDays) * 100)
        : 0;

    // ── Build recent sessions list ───────────────────────────────────────
    const recentSessionIds = dailyRecords.slice(0, 5).flatMap((d) => d.sessions);
    const recentSessions = await Session.find({
      _id: { $in: recentSessionIds },
    })
      .sort({ startTime: -1 })
      .limit(20)
      .select("startTime endTime totalDuration activeTime idleTime waitingTime breakTime focusMode workStatus attendanceStatus");

    const mappedSessions = recentSessions.map((s) => ({
      _id: s._id,
      sessionStart: s.startTime,
      sessionEnd: s.endTime,
      activeSeconds: s.activeTime || 0,
      idleSeconds: s.idleTime || 0,
      waitingSeconds: s.waitingTime || 0,
      breakSeconds: s.breakTime || 0,
      workStatus: s.workStatus,
      focusMode: s.focusMode,
      outcomeNote: null,
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
      dailyBreakdown,
      sessions: mappedSessions,
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
        "startTime endTime totalDuration activeTime idleTime waitingTime breakTime focusMode workStatus attendanceStatus"
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
