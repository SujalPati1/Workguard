const Session = require("../models/Session.model");
const Consent = require("../models/Consent");
const { getOrCreateDaily, recalcAttendance } = require("./dailyActivityController");
const { getLastScore } = require("./wellnessController");

const isSessionStale = (session) => {
  if (!session || !session.startTime) return false;
  const now = new Date();
  const start = new Date(session.startTime);
  return (
    start.getFullYear() !== now.getFullYear() ||
    start.getMonth() !== now.getMonth() ||
    start.getDate() !== now.getDate()
  );
};

const completeStaleSession = async (session) => {
  const start = new Date(session.startTime);
  const midnight = new Date(start);
  midnight.setHours(0, 0, 0, 0);
  const endOfDay = new Date(midnight.getTime() + 24 * 60 * 60 * 1000);

  session.endTime = endOfDay;
  session.totalDuration = Math.floor((endOfDay.getTime() - start.getTime()) / 1000);
  session.attendanceStatus = "COMPLETED";
  await session.save();
  return session;
};

// ✅ START SESSION
const startSession = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { focusMode, workStatus } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Resolve empId from ObjectId
    const User = require("../models/User");
    const user = await User.findById(userId).select("empId");
    if (!user) return res.status(404).json({ message: "User not found" });
    const empId = user.empId;

    // ✅ Prevent multiple running sessions
    const existing = await Session.findOne({
      empId,
      attendanceStatus: "IN_PROGRESS",
    }).sort({ createdAt: -1 });

    if (existing) {
      if (isSessionStale(existing)) {
        await completeStaleSession(existing);
      } else {
        return res.status(400).json({
          message: "⚠️ Session already running",
          session: existing,
        });
      }
    }

    const newSession = await Session.create({
      empId,
      startTime: new Date(),
      attendanceStatus: "IN_PROGRESS",
      focusMode: focusMode || false,
      workStatus: workStatus || "WORKING",
    });

    // ✅ Ensure DailyActivity record exists for today and link session
    const daily = await getOrCreateDaily(empId);
    if (!daily.sessions.includes(newSession._id)) {
      daily.sessions.push(newSession._id);
      daily.sessionCount = daily.sessions.length;
      if (!daily.firstLogin) daily.firstLogin = new Date();
      await daily.save();
    }

    return res.status(201).json({
      message: "✅ Session started",
      sessionId: newSession._id,
      session: newSession,
      dailyActivity: {
        livenessSlots: daily.livenessSlots,
        totalLivenessPassed: daily.totalLivenessPassed,
        attendanceResult: daily.attendanceResult,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "❌ Error starting session",
      error: error.message,
    });
  }
};

// ✅ STOP SESSION (Uses sessionId)
const stopSession = async (req, res) => {
  try {
    const { sessionId, activeSeconds, idleSeconds, waitingSeconds, breakSeconds } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const session = await Session.findById(sessionId);

    if (!session || session.attendanceStatus === "COMPLETED") {
      return res.status(404).json({ message: "⚠️ No running session found" });
    }

    const endTime = new Date();
    const totalSeconds = Math.floor((endTime - session.startTime) / 1000);

    session.endTime = endTime;
    session.totalDuration = totalSeconds;

    // ✅ Store time only if provided (preserves checkpoint data on force-quit)
    if (activeSeconds !== undefined) session.activeTime = activeSeconds;
    if (idleSeconds !== undefined) session.idleTime = idleSeconds;
    if (waitingSeconds !== undefined) session.waitingTime = waitingSeconds;
    if (breakSeconds !== undefined) session.breakTime = breakSeconds;

    session.attendanceStatus = "COMPLETED";
    await session.save();

    // ✅ Sync totals into DailyActivity (aggregate across all today's sessions)
    await syncDailyFromAllSessions(session.empId);

    return res.status(200).json({
      message: "✅ Session ended",
      session,
    });
  } catch (error) {
    return res.status(500).json({
      message: "❌ Error ending session",
      error: error.message,
    });
  }
};

// ✅ RESUME SESSION (Find and return the last IN_PROGRESS session)
const resumeSession = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const User = require("../models/User");
    const user = await User.findById(userId).select("empId");
    if (!user) return res.status(404).json({ message: "User not found" });
    const empId = user.empId;

    const session = await Session.findOne({
      empId,
      attendanceStatus: "IN_PROGRESS",
    }).sort({ createdAt: -1 });

    if (!session) {
      return res.status(404).json({ message: "No paused/in-progress session found" });
    }

    if (isSessionStale(session)) {
      await completeStaleSession(session);
      return res.status(404).json({ message: "No paused/in-progress session found" });
    }

    // Also return daily liveness status for the frontend scheduler
    const daily = await getOrCreateDaily(empId);

    return res.status(200).json({
      message: "✅ Session resumed",
      sessionId: session._id,
      session,
      dailyActivity: {
        livenessSlots: daily.livenessSlots,
        totalLivenessPassed: daily.totalLivenessPassed,
        attendanceResult: daily.attendanceResult,
      },
      wellnessScore: await getLastScore(session._id),
    });
  } catch (error) {
    return res.status(500).json({
      message: "❌ Error resuming session",
      error: error.message,
    });
  }
};

// ✅ CHECKPOINT (Auto-save progress every 30 seconds)
const checkpoint = async (req, res) => {
  try {
    const {
      sessionId, activeSeconds, idleSeconds, waitingSeconds, breakSeconds, workStatus,
      appUsage, appUsageTimeline
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    // Auto-complete if the session spanned across midnight
    if (isSessionStale(session)) {
      await completeStaleSession(session);
      return res.status(205).json({
        message: "Session stale (spanned midnight). Auto-completed.",
        stale: true,
      });
    }

    // Update current times
    session.activeTime = activeSeconds || 0;
    session.idleTime = idleSeconds || 0;
    session.waitingTime = waitingSeconds || 0;
    session.breakTime = breakSeconds || 0;
    session.workStatus = workStatus || session.workStatus;

    // Add checkpoint to history
    session.checkpoints.push({
      timestamp: new Date(),
      activeTime: activeSeconds || 0,
      idleTime: idleSeconds || 0,
      waitingTime: waitingSeconds || 0,
      breakTime: breakSeconds || 0,
    });

    // ── Update App Usage Tracking ─────────────────────────────────────────────
    // Categorization fallback — aligned with engine category labels
    const APP_CATEGORY_MAP = {
      "antigravity.exe":      "Deep Work",
      "electron.exe":         "Deep Work",
      "code.exe":             "Deep Work",
      "cursor.exe":           "Deep Work",
      "pycharm64.exe":        "Deep Work",
      "idea64.exe":           "Deep Work",
      "mongodbcompass.exe":   "Deep Work",
      "dbeaver.exe":          "Deep Work",
      "datagrip64.exe":       "Deep Work",
      "tableplus.exe":        "Deep Work",
      "ssms.exe":             "Deep Work",
      "postman.exe":          "Deep Work",
      "insomnia.exe":         "Deep Work",
      "githubdesktop.exe":    "Deep Work",
      "gitkraken.exe":        "Deep Work",
      "docker.exe":           "Deep Work",
      "figma.exe":            "Deep Work",
      "photoshop.exe":        "Deep Work",
      "winword.exe":          "Deep Work",
      "excel.exe":            "Deep Work",
      "powerpnt.exe":         "Deep Work",
      "cmd.exe":              "Terminal",
      "powershell.exe":       "Terminal",
      "pwsh.exe":             "Terminal",
      "windowsterminal.exe":  "Terminal",
      "wt.exe":               "Terminal",
      "slack.exe":            "Comms",
      "outlook.exe":          "Comms",
      "teams.exe":            "Meeting",
      "zoom.exe":             "Meeting",
      "chrome.exe":           "Browser",
      "msedge.exe":           "Browser",
      "firefox.exe":          "Browser",
      "explorer.exe":         "System",
    };

    if (appUsage && typeof appUsage === "object") {
      for (const [appName, seconds] of Object.entries(appUsage)) {
        if (typeof seconds === "number" && seconds > 0) {
          // MongoDB does not allow dots (.) in Map keys. Sanitize them.
          const safeAppName = appName.replace(/\./g, "_");
          const currentTotal = session.appUsageSummary.get(safeAppName) || 0;
          session.appUsageSummary.set(safeAppName, currentTotal + seconds);
        }
      }
      // Ensure Mongoose detects the Map update
      session.markModified("appUsageSummary");
    }

    if (Array.isArray(appUsageTimeline) && appUsageTimeline.length > 0) {
      // Auto-categorize before pushing to DB
      const processedTimeline = appUsageTimeline.map(item => {
        let cat = item.category;
        if (cat === "Other" || cat === "Unknown" || !cat) {
          cat = APP_CATEGORY_MAP[item.app.toLowerCase()] || "Unknown";
        }
        return { ...item, category: cat };
      });
      session.appUsageTimeline.push(...processedTimeline);
    }

    await session.save();

    // ✅ Sync totals into DailyActivity
    await syncDailyFromAllSessions(session.empId);

    return res.status(200).json({
      message: "✅ Checkpoint saved",
      session,
    });
  } catch (error) {
    return res.status(500).json({
      message: "❌ Error saving checkpoint",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: aggregate ALL today's sessions into DailyActivity
// ─────────────────────────────────────────────────────────────────────────────
const syncDailyFromAllSessions = async (empId) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // Get ALL of today's sessions (both in-progress and completed)
  const sessions = await Session.find({
    empId,
    startTime: { $gte: startOfDay, $lte: endOfDay },
  });

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
    totalDuration += s.totalDuration || (s.attendanceStatus === "IN_PROGRESS"
      ? Math.floor((Date.now() - new Date(s.startTime).getTime()) / 1000)
      : 0);
  });

  const daily = await getOrCreateDaily(empId);
  daily.totalActiveTime = totalActive;
  daily.totalIdleTime = totalIdle;
  daily.totalWaitingTime = totalWaiting;
  daily.totalBreakTime = totalBreak;
  daily.totalDuration = totalDuration;
  daily.sessionCount = sessions.length;
  daily.sessions = sessions.map((s) => s._id);
  daily.lastActivity = new Date();

  if (totalDuration > 0) {
    daily.averageFocusScore = Math.min(100, Math.round((totalActive / totalDuration) * 100));
  }

  recalcAttendance(daily);
  await daily.save();
};

// ✅ GET TODAY REPORT
const getTodayReport = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const User = require("../models/User");
    const user = await User.findById(userId).select("empId");
    if (!user) return res.status(404).json({ message: "User not found" });
    const empId = user.empId;

    // Get DailyActivity — the single source of truth
    const daily = await getOrCreateDaily(empId);

    // Also get individual sessions for drill-down
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const sessions = await Session.find({
      empId,
      startTime: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ startTime: 1 });

    const focusScore = daily.averageFocusScore;

    return res.status(200).json({
      empId,
      date: daily.date,
      sessionCount: daily.sessionCount,
      totalWorkTime: daily.totalDuration,
      totalActive: daily.totalActiveTime,
      totalLoggedTime: daily.totalPlatformTime,
      totalIdle: daily.totalIdleTime,
      totalWaiting: daily.totalWaitingTime,
      totalBreak: daily.totalBreakTime,
      focusScore,
      attendanceStatus: daily.attendanceResult,
      complianceScore: daily.complianceScore,
      livenessSlots: daily.livenessSlots,
      totalLivenessPassed: daily.totalLivenessPassed,
      sessions,
    });
  } catch (error) {
    return res.status(500).json({
      message: "❌ Error generating report",
      error: error.message,
    });
  }
};

// ✅ GET SESSION BY ID
const getSessionById = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    return res.status(200).json({
      message: "✅ Session retrieved",
      session,
    });
  } catch (error) {
    return res.status(500).json({
      message: "❌ Error retrieving session",
      error: error.message,
    });
  }
};

module.exports = {
  startSession,
  stopSession,
  resumeSession,
  checkpoint,
  getTodayReport,
  getSessionById,
};
