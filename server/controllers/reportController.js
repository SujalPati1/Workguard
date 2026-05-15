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
 * Weighted Productivity Index — aligned with engine category labels.
 * Engine outputs: "Deep Work", "Terminal", "Comms", "Meeting",
 *                 "Browser", "Browsing", "Media", "Social",
 *                 "Productivity", "System", "Other"
 */
const CATEGORY_WEIGHTS = {
  "Deep Work":    1.0,  // IDEs, DBs, Design, Docs
  "Terminal":     0.9,  // CLI — strongly correlated with dev work
  "Productivity": 0.8,  // Note-taking, task managers
  "Comms":        0.5,  // Slack, Email — necessary but shallow
  "Meeting":      0.5,  // Zoom, Teams — necessary but passive
  "Browser":      0.3,  // Generic browsing (refined by server pattern-match)
  "Browsing":     0.3,
  "Deep Work (Browser)": 1.0, // GitHub, localhost, docs
  "System":       0.05, // File Explorer, Calculator etc. — nearly noise
  "Other":        0.15, // Unknown but not confirmed distraction
  "Unknown":      0.15,
  "Social":       0.0,  // Confirmed distraction
  "Media":        0.0,  // Streaming, music etc.
  "Entertainment":0.0,
  "Disabled":     0.0,
};

/**
 * Server-side app name → category fallback.
 * Used when the engine sends 'Other' or 'Unknown' for a known app.
 */
const APP_CATEGORY_MAP = {
  // Workguard itself
  "antigravity.exe":      "Deep Work",
  "electron.exe":         "Deep Work",
  // Code Editors
  "code.exe":             "Deep Work",
  "cursor.exe":           "Deep Work",
  "pycharm64.exe":        "Deep Work",
  "idea64.exe":           "Deep Work",
  "webstorm64.exe":       "Deep Work",
  "sublime_text.exe":     "Deep Work",
  "notepad++.exe":        "Deep Work",
  "vim.exe":              "Deep Work",
  "nvim.exe":             "Deep Work",
  // Database Tools
  "mongodbcompass.exe":   "Deep Work",
  "dbeaver.exe":          "Deep Work",
  "datagrip64.exe":       "Deep Work",
  "tableplus.exe":        "Deep Work",
  "ssms.exe":             "Deep Work",
  "azuredatastudio.exe":  "Deep Work",
  // API & Dev Tools
  "postman.exe":          "Deep Work",
  "insomnia.exe":         "Deep Work",
  "githubdesktop.exe":    "Deep Work",
  "gitkraken.exe":        "Deep Work",
  "sourcetree.exe":       "Deep Work",
  "docker.exe":           "Deep Work",
  // Terminals
  "cmd.exe":              "Terminal",
  "powershell.exe":       "Terminal",
  "pwsh.exe":             "Terminal",
  "windowsterminal.exe":  "Terminal",
  "wt.exe":               "Terminal",
  // Design
  "figma.exe":            "Deep Work",
  "xd.exe":               "Deep Work",
  "photoshop.exe":        "Deep Work",
  // Office
  "winword.exe":          "Deep Work",
  "excel.exe":            "Deep Work",
  "powerpnt.exe":         "Deep Work",
  // Communication
  "slack.exe":            "Comms",
  "teams.exe":            "Meeting",
  "zoom.exe":             "Meeting",
  "outlook.exe":          "Comms",
  // Browsers
  "chrome.exe":           "Browser",
  "msedge.exe":           "Browser",
  "firefox.exe":          "Browser",
  // System noise
  "explorer.exe":         "System",
};

/**
 * Derives a 0-100 Productivity Intensity Index for a session.
 * Formula:
 *   1. Compute weighted time sum using category weights.
 *   2. Normalise by active time to get base index.
 *   3. Apply wellness factor (biometric quality multiplier).
 *   4. Apply continuity bonus (reward staying in one category vs. fragmented).
 */
const deriveIntensityIndex = (session) => {
  if (!session.activeTime || session.activeTime <= 0) return 0;

  const timeline = session.appUsageTimeline || [];

  if (timeline.length === 0) {
    // Fallback: no app data — give benefit-of-the-doubt 50%, modulated by wellness
    const wellness = (session.finalWellnessScore || 100) / 100;
    return Math.round(50 * wellness);
  }

  // Step 1: Weighted time sum
  let weightedSum = 0;
  const categoryTimes = {}; // track time per category for continuity bonus

  timeline.forEach((item) => {
    let category = item.category;

    // Server-side fallback: resolve generic tags using app name
    if (!category || category === "Other" || category === "Unknown") {
      category = APP_CATEGORY_MAP[item.app?.toLowerCase()] || "Unknown";
    }

    const weight = CATEGORY_WEIGHTS[category] ?? CATEGORY_WEIGHTS["Unknown"];
    weightedSum += item.duration * weight;
    categoryTimes[category] = (categoryTimes[category] || 0) + item.duration;
  });

  // Step 2: Base index normalised by active time
  const baseIndex = Math.min(100, (weightedSum / session.activeTime) * 100);

  // Step 3: Wellness multiplier (biometric quality factor)
  const wellnessFactor = (session.finalWellnessScore || 100) / 100;

  // Step 4: Continuity bonus
  // If >70% of the active time was spent in one category, reward focused work.
  // Capped at +10 so it never dominates the score.
  const totalTimeCounted = Object.values(categoryTimes).reduce((a, b) => a + b, 0);
  let continuityBonus = 0;
  if (totalTimeCounted > 0) {
    const dominantCategoryRatio = Math.max(...Object.values(categoryTimes)) / totalTimeCounted;
    if (dominantCategoryRatio >= 0.7) {
      continuityBonus = 10 * (dominantCategoryRatio - 0.7) / 0.3; // 0–10 pts
    }
  }

  const finalScore = (baseIndex * wellnessFactor) + continuityBonus;
  return Math.min(100, Math.round(finalScore));
};

/**
 * Focus score = activeTime / totalDuration * 100
 */
const deriveFocusScore = (activeSeconds, totalDuration) => {
  if (!totalDuration || totalDuration <= 0) return 0;
  return Math.min(100, Math.round((activeSeconds / totalDuration) * 100));
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/report/today
// @desc    Get today's aggregated work report for the logged-in employee
// @access  Private (authMiddleware applied in routes)
// ─────────────────────────────────────────────────────────────────────────────
exports.getTodayReport = async (req, res) => {
  try {
    // Use the ObjectId from the JWT — no URL param needed
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Look up the employee by their ObjectId to get their empId string
    const user = await User.findById(userId).select("-password -refreshToken");
    if (!user) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    const empId = user.empId;

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
    const burnoutRisk = deriveBurnoutRisk(totalActive, totalBreak);

    // Attendance comes from DailyActivity — NOT from session-level calculation
    const attendanceStatus = daily?.attendanceResult || "ABSENT";

    // Enrich sessions with their specific Productivity Intensity Index
    const enrichedSessions = sessions.map(s => {
      const obj = s.toObject();
      obj.productivityIndex = deriveIntensityIndex(s);
      return obj;
    });

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
      burnoutRisk,
      attendanceStatus,

      // Liveness compliance (from DailyActivity)
      livenessSlots: daily?.livenessSlots || [],
      totalLivenessPassed: daily?.totalLivenessPassed || 0,
      complianceScore: daily?.complianceScore || 0,

      // Wellness metrics (from DailyActivity — accumulated via wellness-sync pings)
      averageStrainScore:  daily?.averageStrainScore  || 0,
      totalDistractions:   daily?.totalDistractions   || 0,
      flowDurationMins:    daily?.flowDurationMins     || 0,

      // Thresholds for progress calculation
      presentThreshold: parseInt(process.env.PRESENT_ACTIVE_SECONDS || "3600", 10),
      partialThreshold: parseInt(process.env.PARTIAL_ACTIVE_SECONDS || "1800", 10),

      // Full sessions list for drilling down (enriched with productivity index)
      sessions: enrichedSessions,
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
// @route   GET /api/report/summary?months=3
// @desc    Attendance summary for the last N months (default 3)
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.getAttendanceSummary = async (req, res) => {
  try {
    const userId = req.user?.id;
    const months = parseInt(req.query.months || "3", 10);

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Look up employee by ObjectId
    const user = await User.findById(userId).select("-password -refreshToken");
    if (!user) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    const empId = user.empId;

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
// @route   GET /api/report/history?page=1&limit=10
// @desc    Paginated full session history
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.getSessionHistory = async (req, res) => {
  try {
    const userId = req.user?.id;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "10", 10)));
    const skip = (page - 1) * limit;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const user = await User.findById(userId).select("fullName department empId");
    if (!user) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }
    const empId = user.empId;

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
