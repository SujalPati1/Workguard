/**
 * dailyActivityController.js
 *
 * Attendance Logic (Industry Standard):
 *   - Attendance is decided by totalPlatformTime (heartbeat pings) + liveness compliance.
 *   - Work sessions are OPTIONAL and feed productivity metrics only.
 *   - Liveness triggers are RANDOMISED within each slot window.
 *   - Each popup has a 10-minute response window; missing it = MISSED.
 *
 * Endpoints:
 *   POST /api/daily/heartbeat        — accumulate platform time (every 2 min)
 *   POST /api/daily/liveness         — mark a slot PASSED after biometric verify
 *   POST /api/daily/liveness/missed  — mark a slot MISSED (popup timed out)
 *   POST /api/daily/sync             — session checkpoint rolls up productivity metrics
 *   GET  /api/daily/today/:empId     — full daily record
 *   GET  /api/daily/liveness-status/:empId — lightweight schedule for frontend
 */

const DailyActivity = require("../models/DailyActivity");

// ── Thresholds from .env ──────────────────────────────────────────────────────
// Platform time thresholds (seconds the app must be open)
const PRESENT_PLATFORM_SECONDS = parseInt(process.env.PRESENT_ACTIVE_SECONDS  || "3600", 10);
const PARTIAL_PLATFORM_SECONDS = parseInt(process.env.PARTIAL_ACTIVE_SECONDS  || "1800", 10);

// How long (ms) the employee has to respond to a liveness popup before it's MISSED
const LIVENESS_RESPONSE_WINDOW_MS = parseInt(process.env.LIVENESS_RESPONSE_WINDOW_MS || "600000", 10); // 10 min

const TOTAL_LIVENESS_REQUIRED = 3;

// ── Randomise trigger times for all 3 slots ───────────────────────────────────
/**
 * Divide the total required platform time into 3 equal slots,
 * and pick a random threshold of seconds within each slot window.
 *
 * Example: threshold = 3600 s → windows are [0-1200s], [1200-2400s], [2400-3600s]
 * Slot 1 trigger: rand(0,   1200) seconds
 * Slot 2 trigger: rand(1200, 2400) seconds
 * Slot 3 trigger: rand(2400, 3600) seconds
 */
const generateTriggerSeconds = (thresholdSeconds) => {
  const windowSize = Math.floor(thresholdSeconds / TOTAL_LIVENESS_REQUIRED);
  const triggers = [];

  for (let i = 0; i < TOTAL_LIVENESS_REQUIRED; i++) {
    const windowStart = i * windowSize;
    const windowEnd   = (i + 1) * windowSize;
    // Random offset within the window (at least 30s into the window to avoid instant triggers)
    const minOffset = i === 0 ? 0 : 30;
    const offset = Math.floor(Math.random() * (windowEnd - windowStart - minOffset)) + windowStart + minOffset;
    triggers.push(offset);
  }

  return triggers;
};

// ── Internal helper: get or create today's record ─────────────────────────────
const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getOrCreate = async (empId) => {
  const today = getLocalDateString(); // "YYYY-MM-DD" in local time

  let daily = await DailyActivity.findOne({ empId, date: today });

  if (!daily) {
    const now = new Date();
    const triggerSeconds = generateTriggerSeconds(PRESENT_PLATFORM_SECONDS);

    try {
      daily = await DailyActivity.create({
        empId,
        date: today,
        firstLogin: now,
        lastActivity: now,
        livenessSlots: [
          { slotIndex: 1, status: "PENDING", triggerPlatformSeconds: triggerSeconds[0] },
          { slotIndex: 2, status: "PENDING", triggerPlatformSeconds: triggerSeconds[1] },
          { slotIndex: 3, status: "PENDING", triggerPlatformSeconds: triggerSeconds[2] },
        ],
      });
      console.log(`[Daily] New record for ${empId}. Liveness triggers at platform seconds: ${triggerSeconds.join(", ")}`);
    } catch (error) {
      if (error.code === 11000) {
        // Created concurrently, fetch the newly created record
        daily = await DailyActivity.findOne({ empId, date: today });
      } else {
        throw error;
      }
    }
  }

  return daily;
};

// ── Recalculate attendance verdict ────────────────────────────────────────────
const recalcAttendance = (daily) => {
  const passed  = daily.livenessSlots.filter((s) => s.status === "PASSED").length;
  daily.totalLivenessPassed = passed;

  // Compliance score: proportion of required checks that were PASSED
  daily.complianceScore = Math.round((passed / TOTAL_LIVENESS_REQUIRED) * 100);

  const platformTime = daily.totalPlatformTime;

  // PRESENT: >= 80% platform time + at least 2 liveness checks passed
  if (platformTime >= (0.8 * PRESENT_PLATFORM_SECONDS) && passed >= 2) {
    daily.attendanceResult = "PRESENT";
  // PARTIAL: sufficient platform time + at least 1 liveness passed
  } else if (platformTime >= PARTIAL_PLATFORM_SECONDS && passed >= 1) {
    daily.attendanceResult = "PARTIAL";
  // PARTIAL: even below time threshold — any missed liveness = partial
  } else if (passed >= 1) {
    daily.attendanceResult = "PARTIAL";
  } else {
    daily.attendanceResult = "ABSENT";
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/daily/heartbeat
// Body: { empId }
// Called by the frontend every 2 minutes while the app is open.
// ─────────────────────────────────────────────────────────────────────────────

exports.heartbeat = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Resolve empId from the User record (ObjectId → empId string)
    const User = require("../models/User");
    const user = await User.findById(userId).select("empId");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const empId = user.empId;

    const daily = await getOrCreate(empId);
    const now = new Date();

    // Only accumulate time if we have a previous heartbeat AND it was recent
    if (daily.lastHeartbeat) {
      const diffSeconds = Math.floor((now - daily.lastHeartbeat) / 1000);
      
      // If diff is less than 5 minutes (300s), add it.
      // If it's greater, the app was closed and reopened, so we don't add the offline time.
      if (diffSeconds > 0 && diffSeconds <= 300) {
        daily.totalPlatformTime += diffSeconds;
      }
    }

    daily.lastHeartbeat  = now;
    daily.lastActivity   = now;

    recalcAttendance(daily);
    await daily.save();

    return res.status(200).json({
      success: true,
      totalPlatformTime: daily.totalPlatformTime,
      attendanceResult:  daily.attendanceResult,
      date:              daily.date,
    });
  } catch (err) {
    console.error("heartbeat error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/daily/liveness/missed
// Body: { empId, slotIndex }
// Called by the frontend when the 10-minute response window expires.
// ─────────────────────────────────────────────────────────────────────────────
exports.markMissed = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { slotIndex } = req.body;
    if (!userId || !slotIndex) {
      return res.status(400).json({ success: false, message: "slotIndex is required" });
    }

    const User = require("../models/User");
    const user = await User.findById(userId).select("empId");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    const empId = user.empId;

    const daily = await getOrCreate(empId);
    const slot  = daily.livenessSlots.find((s) => s.slotIndex === slotIndex);

    if (!slot) {
      return res.status(400).json({ success: false, message: `Invalid slotIndex: ${slotIndex}` });
    }

    // Only mark MISSED if it was still PENDING (don't overwrite PASSED)
    if (slot.status === "PENDING") {
      slot.status = "MISSED";
      daily.lastActivity = new Date();
      recalcAttendance(daily);
      await daily.save();
      console.log(`[Daily] Slot ${slotIndex} MISSED for ${empId}.`);
    }

    return res.status(200).json({
      success:          true,
      message:          `Slot ${slotIndex} marked as MISSED`,
      attendanceResult: daily.attendanceResult,
      livenessSlots:    daily.livenessSlots,
    });
  } catch (err) {
    console.error("markMissed error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/daily/liveness
// Body: { empId, slotIndex, score }
// Called by Electron when the biometric engine confirms is_live: true.
// ─────────────────────────────────────────────────────────────────────────────
exports.recordLiveness = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { slotIndex, score } = req.body;
    if (!userId || !slotIndex) {
      return res.status(400).json({ success: false, message: "slotIndex is required" });
    }

    const User = require("../models/User");
    const user = await User.findById(userId).select("empId");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    const empId = user.empId;

    const daily = await getOrCreate(empId);
    const slot  = daily.livenessSlots.find((s) => s.slotIndex === slotIndex);

    if (!slot) {
      return res.status(400).json({ success: false, message: `Invalid slotIndex: ${slotIndex}` });
    }

    // Idempotent — already passed
    if (slot.status === "PASSED") {
      return res.status(200).json({ success: true, message: "Slot already verified", daily });
    }

    slot.status      = "PASSED";
    slot.completedAt = new Date();
    slot.score       = score || 0;

    daily.lastActivity = new Date();
    recalcAttendance(daily);
    await daily.save();

    return res.status(200).json({
      success:              true,
      message:              `Liveness slot ${slotIndex} verified`,
      totalLivenessPassed:  daily.totalLivenessPassed,
      complianceScore:      daily.complianceScore,
      attendanceResult:     daily.attendanceResult,
      daily,
    });
  } catch (err) {
    console.error("recordLiveness error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/daily/sync — session checkpoint rolls up productivity metrics
// Body: { empId, activeTime, idleTime, waitingTime, breakTime, totalDuration, sessionId }
// ─────────────────────────────────────────────────────────────────────────────
exports.syncSessionTotals = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { activeTime, idleTime, waitingTime, breakTime, totalDuration, sessionId } = req.body;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const User = require("../models/User");
    const user = await User.findById(userId).select("empId");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    const empId = user.empId;

    const daily = await getOrCreate(empId);

    if (activeTime  !== undefined) daily.totalActiveTime  = activeTime;
    if (idleTime    !== undefined) daily.totalIdleTime    = idleTime;
    if (waitingTime !== undefined) daily.totalWaitingTime = waitingTime;
    if (breakTime   !== undefined) daily.totalBreakTime   = breakTime;
    if (totalDuration !== undefined) daily.totalDuration  = totalDuration;

    if (sessionId && !daily.sessions.includes(sessionId)) {
      daily.sessions.push(sessionId);
      daily.sessionCount = daily.sessions.length;
    }

    const effectiveTotalTime = daily.totalActiveTime + daily.totalIdleTime;
    if (effectiveTotalTime > 0) {
      daily.averageFocusScore = Math.min(
        100,
        Math.round((daily.totalActiveTime / effectiveTotalTime) * 100)
      );
    } else {
      daily.averageFocusScore = 0;
    }

    daily.lastActivity = new Date();
    recalcAttendance(daily);
    await daily.save();

    return res.status(200).json({
      success:          true,
      message:          "Daily activity synced",
      attendanceResult: daily.attendanceResult,
      daily,
    });
  } catch (err) {
    console.error("syncSessionTotals error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/daily/today/:empId — full daily record for dashboard
// ─────────────────────────────────────────────────────────────────────────────
exports.getToday = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const User = require("../models/User");
    const user = await User.findById(userId).select("empId");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    const empId = user.empId;

    const daily = await getOrCreate(empId);
    return res.status(200).json({ success: true, daily });
  } catch (err) {
    console.error("getToday error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/daily/liveness-status/:empId
// Lightweight status used by the frontend scheduler every 15 seconds.
// Returns exact triggerTime for each slot so the frontend knows when to fire.
// ─────────────────────────────────────────────────────────────────────────────
exports.getLivenessStatus = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const User = require("../models/User");
    const user = await User.findById(userId).select("empId");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    const empId = user.empId;

    const daily = await getOrCreate(empId);

    return res.status(200).json({
      success:               true,
      date:                  daily.date,
      firstLogin:            daily.firstLogin,
      presentThreshold:      PRESENT_PLATFORM_SECONDS,
      totalPlatformTime:     daily.totalPlatformTime,
      livenessResponseWindowMs: LIVENESS_RESPONSE_WINDOW_MS,
      livenessSlots:         daily.livenessSlots,
      totalLivenessPassed:   daily.totalLivenessPassed,
      totalLivenessRequired: daily.totalLivenessRequired,
      nextPendingSlot:       daily.livenessSlots.find((s) => s.status === "PENDING") || null,
    });
  } catch (err) {
    console.error("getLivenessStatus error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Exported helpers for other controllers
exports.getOrCreateDaily   = getOrCreate;
exports.recalcAttendance   = recalcAttendance;
