// server/controllers/wellnessController.js
/**
 * Wellness API — Employee-private biometric insight logging.
 *
 * ALL endpoints here are strictly employee-facing. The data is NEVER
 * exposed to managers or admins through any report endpoint.
 *
 * Wellness Score Rules (per session, starts at 100):
 *   Penalties:
 *     DISTRACTED    : -5 pts
 *     DROWSY        : -3 pts
 *     YAWN          : -1 pt
 *     BAD_POSTURE   : -1 pt per event (called once/min while sustained)
 *
 *   Rewards:
 *     FOCUSED       : +2 pts per event (called every 5-min focus streak)
 *     BREAK_RECOVERY: +5 pts (returning from break in focused state)
 *
 *   Score is always clamped between 0 and 100.
 *   Score resets to 100 at every new session start.
 */
const WellnessLog  = require("../models/WellnessLog");
const Session      = require("../models/Session.model");
const User         = require("../models/User");

const SCORE_DELTA = {
  FOCUSED:        +2,
  BREAK_RECOVERY: +5,
  DISTRACTED:     -5,
  DROWSY:         -3,
  YAWN:           -1,
};

const EVENT_LABELS = {
  FOCUSED:        "Focus Streak (+2 pts)",
  BREAK_RECOVERY: "Break Recovery (+5 pts)",
  DISTRACTED:     "Distraction Detected (-5 pts)",
  DROWSY:         "Drowsiness Detected (-3 pts)",
  YAWN:           "Yawn Detected (-1 pt)",
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wellness/event
// Called by the React frontend when the engine triggers a biometric alert.
// Body: { empId, sessionId, eventType, currentScore }
// ─────────────────────────────────────────────────────────────────────────────
exports.logWellnessEvent = async (req, res) => {
  try {
    const { empId, sessionId, eventType, currentScore } = req.body;

    if (!empId || !sessionId || !eventType) {
      return res.status(400).json({
        success: false,
        message: "empId, sessionId, and eventType are required",
      });
    }

    const delta = SCORE_DELTA[eventType];
    if (delta === undefined) {
      return res.status(400).json({
        success: false,
        message: `Unknown eventType: ${eventType}. Valid types: ${Object.keys(SCORE_DELTA).join(", ")}`,
      });
    }

    // Compute new score (clamped 0-100)
    const previousScore = typeof currentScore === "number" ? currentScore : 100;
    const newScore = Math.max(0, Math.min(100, previousScore + delta));

    // Persist the event log entry
    const logEntry = await WellnessLog.create({
      empId,
      sessionId,
      eventType,
      scoreSnapshot: newScore,
      pointsDelta:   delta,
      label:         EVENT_LABELS[eventType] || eventType,
    });

    return res.status(201).json({
      success:      true,
      newScore,
      pointsDelta:  delta,
      logEntryId:   logEntry._id,
    });
  } catch (err) {
    console.error("logWellnessEvent error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error logging wellness event",
      error:   err.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wellness/session/finalize
// Called when a session ends. Persists the final wellness score on the Session doc.
// Body: { sessionId, finalScore }
// ─────────────────────────────────────────────────────────────────────────────
exports.finalizeWellness = async (req, res) => {
  try {
    const { sessionId, finalScore } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: "sessionId is required" });
    }

    const clampedScore = Math.max(0, Math.min(100, Math.round(finalScore ?? 100)));

    await Session.findByIdAndUpdate(sessionId, {
      $set: { finalWellnessScore: clampedScore },
    });

    return res.status(200).json({ success: true, finalWellnessScore: clampedScore });
  } catch (err) {
    console.error("finalizeWellness error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error finalizing wellness score",
      error:   err.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/wellness/session/:sessionId
// Fetches the full timeline of wellness events for a session (for graph plotting).
// Only accessible by the owner (enforced by authMiddleware + ownership check).
// ─────────────────────────────────────────────────────────────────────────────
exports.getSessionWellness = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const requestingUserId = req.user?.id; // From JWT payload

    if (!sessionId) {
      return res.status(400).json({ success: false, message: "sessionId is required" });
    }

    // Ownership guard: only the employee who owns the session can see its logs
    const session = await Session.findById(sessionId).select("empId finalWellnessScore");
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    const user = await User.findById(requestingUserId).select("empId");
    if (!user || session.empId !== user.empId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Fetch all events for this session ordered by time ascending (for graph)
    const events = await WellnessLog.find({ sessionId })
      .sort({ timestamp: 1 })
      .select("timestamp eventType scoreSnapshot pointsDelta label -_id");

    // Build session insights summary
    const countsByType = {};
    events.forEach(e => {
      countsByType[e.eventType] = (countsByType[e.eventType] || 0) + 1;
    });

    const insights = [];
    if (countsByType.YAWN) {
      insights.push(`You yawned ${countsByType.YAWN} time(s). Consider a short water/stretch break.`);
    }
    if (countsByType.DROWSY) {
      insights.push(`Drowsiness was detected ${countsByType.DROWSY} time(s). Ensure you are well-rested.`);
    }
    if (countsByType.DISTRACTED) {
      insights.push(`You were distracted ${countsByType.DISTRACTED} time(s). Try reducing background noise.`);
    }
    if (countsByType.FOCUSED && countsByType.FOCUSED >= 3) {
      insights.push(`Great focus streaks! You hit ${countsByType.FOCUSED} consecutive focused periods.`);
    }

    return res.status(200).json({
      success:            true,
      sessionId,
      finalWellnessScore: session.finalWellnessScore,
      events,
      insights,
      eventCounts:        countsByType,
    });
  } catch (err) {
    console.error("getSessionWellness error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching wellness data",
      error:   err.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/wellness/sessions/:empId
// Lists all sessions with their finalWellnessScore for the session list UI.
// ─────────────────────────────────────────────────────────────────────────────
exports.getWellnessSessions = async (req, res) => {
  try {
    const { empId: requestedObjectId } = req.params; // from url, which we changed to employee._id
    const requestingUserId = req.user?.id;           // from JWT payload

    // Strong ownership guard using exact ObjectId matching
    if (requestedObjectId !== requestingUserId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Resolve the string empId (e.g. "EMP101") required for Session queries
    const user = await User.findById(requestingUserId).select("empId");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const sessions = await Session.find({ empId: user.empId, attendanceStatus: "COMPLETED" })
      .sort({ startTime: -1 })
      .limit(20)
      .select("startTime endTime totalDuration focusMode finalWellnessScore");

    return res.status(200).json({ success: true, sessions });
  } catch (err) {
    console.error("getWellnessSessions error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching wellness sessions",
      error:   err.message,
    });
  }
};
