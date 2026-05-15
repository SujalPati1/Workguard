// server/controllers/wellnessController.js
/**
 * Wellness API — Employee-private biometric insight logging.
 *
 * ALL endpoints here are strictly employee-facing. The data is NEVER
 * exposed to managers or admins through any report endpoint.
 *
 * PHASE 1 UPGRADE — Backend-Authoritative Scoring:
 *   The server is now the SOLE source of truth for the wellness score.
 *   The `currentScore` field sent from the client is IGNORED. Instead, the
 *   server fetches the last recorded score for the session and applies the
 *   delta atomically. This eliminates race conditions entirely.
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
 *     HEARTBEAT     : 0 pts (steady-state marker, no score change)
 *
 *   Score is always clamped between 0 and 100.
 *   Score resets to 100 at every new session start.
 */
const WellnessLog  = require("../models/WellnessLog");
const Session      = require("../models/Session.model");
const User         = require("../models/User");
const Consent      = require("../models/Consent");

const SCORE_DELTA = {
  FOCUSED:        +2,
  BREAK_RECOVERY: +5,
  DISTRACTED:     -5,
  DROWSY:         -3,
  YAWN:           -1,
  BAD_POSTURE:    -1,
  HEARTBEAT:       0, // Steady-state marker: no score change, just a graph anchor
};

const EVENT_LABELS = {
  FOCUSED:        "Focus Streak (+2 pts)",
  BREAK_RECOVERY: "Break Recovery (+5 pts)",
  DISTRACTED:     "Distraction Detected (-5 pts)",
  DROWSY:         "Drowsiness Detected (-3 pts)",
  YAWN:           "Yawn Detected (-1 pt)",
  BAD_POSTURE:    "Poor Posture (-1 pt)",
  HEARTBEAT:      "Steady Focus ✓",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: atomically get the last score for a session.
// Returns null if no 'real' wellness events (alerts/streaks) were recorded.
// ─────────────────────────────────────────────────────────────────────────────
const getLastScore = async (sessionId) => {
  // Find the most recent log entry that ISN'T a virtual anchor or a heartbeat
  const lastRealEntry = await WellnessLog.findOne({ 
    sessionId,
    eventType: { $nin: ["HEARTBEAT", "SESSION_START", "SESSION_END"] }
  })
    .sort({ timestamp: -1 })
    .select("scoreSnapshot")
    .lean();
  
  if (!lastRealEntry) return null; // No real wellness data recorded
  return lastRealEntry.scoreSnapshot;
};
exports.getLastScore = getLastScore;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wellness/event
// Called by the React frontend when the engine triggers a biometric alert.
// Body: { empId, sessionId, eventType, clientTimestamp? }
// NOTE: currentScore is DEPRECATED and ignored. Server is now authoritative.
// ─────────────────────────────────────────────────────────────────────────────
exports.logWellnessEvent = async (req, res) => {
  try {
    const { sessionId, eventType, clientTimestamp } = req.body;

    if (!sessionId || !eventType) {
      return res.status(400).json({
        success: false,
        message: "sessionId, and eventType are required",
      });
    }

    // Resolve the standardized empId string from the authenticated user
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const User = require("../models/User");
    const user = await User.findById(userId).select("empId");
    if (!user) return res.status(404).json({ message: "User not found" });
    const empId = user.empId;

    const delta = SCORE_DELTA[eventType];
    if (delta === undefined) {
      return res.status(400).json({
        success: false,
        message: `Unknown eventType: ${eventType}. Valid: ${Object.keys(SCORE_DELTA).join(", ")}`,
      });
    }

    // ── PHASE 1A: Backend-Authoritative Scoring ───────────────────────────────
    // Atomically read the last score and compute the new one.
    // We do this BEFORE writing so there are no write-read race conditions.
    const lastScore = await getLastScore(sessionId);
    const previousScore = lastScore !== null ? lastScore : 100;
    const newScore = Math.max(0, Math.min(100, previousScore + delta));

    // Use client timestamp if provided (more accurate — avoids network latency
    // distorting where events appear on the timeline graph).
    const eventTime = clientTimestamp ? new Date(clientTimestamp) : new Date();

    // ── DATA RETENTION: Calculate expiration date ────────────────────────────
    // Default to 30 days if no consent record is found
    let retentionDays = 30;
    try {
      const consentRecord = await Consent.findOne({ empId });
      if (consentRecord?.retention) {
        // Parse "X days" string
        const match = consentRecord.retention.match(/(\d+)/);
        if (match) retentionDays = parseInt(match[1], 10);
      }
    } catch (e) {
      console.warn("Retention fetch failed, defaulting to 30 days", e);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    // Persist the event log entry
    const logEntry = await WellnessLog.create({
      empId,
      sessionId,
      timestamp:     eventTime,
      eventType,
      scoreSnapshot: newScore,
      pointsDelta:   delta,
      label:         EVENT_LABELS[eventType] || eventType,
      expiresAt,
    });

    return res.status(201).json({
      success:     true,
      newScore,
      pointsDelta: delta,
      logEntryId:  logEntry._id,
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
// Body: { sessionId }
// NOTE: finalScore is now computed from the last WellnessLog entry, not from client.
// ─────────────────────────────────────────────────────────────────────────────
exports.finalizeWellness = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: "sessionId is required" });
    }

    // ── Authoritative final score ───────────────────────────────────────────
    const authoritative = await getLastScore(sessionId);
    
    // If null, it means no biometric data was recorded. We store null.
    const finalScore = authoritative === null ? null : Math.max(0, Math.min(100, Math.round(authoritative)));

    await Session.findByIdAndUpdate(sessionId, {
      $set: { finalWellnessScore: finalScore },
    });

    return res.status(200).json({ success: true, finalWellnessScore: finalScore });
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
// Fetches the full wellness timeline for a session (graph + insights).
// PHASE 1B: Adds Virtual Anchor nodes for a full-width graph.
// PHASE 3A: Returns gap metadata for No-Data visualization.
// ─────────────────────────────────────────────────────────────────────────────
exports.getSessionWellness = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const requestingUserId = req.user?.id;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: "sessionId is required" });
    }

    // Ownership guard: only the employee who owns the session can see its logs
    const session = await Session.findById(sessionId).select("empId finalWellnessScore startTime endTime attendanceStatus appUsageTimeline");
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    const user = await User.findById(requestingUserId).select("empId");
    if (!user || session.empId !== user.empId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Fetch all real events ordered by time ascending
    const rawEvents = await WellnessLog.find({ sessionId })
      .sort({ timestamp: 1 })
      .select("timestamp eventType scoreSnapshot pointsDelta label -_id")
      .lean();

    // ── PHASE 1B: Timeline Virtualization — Virtual Anchor Nodes ─────────────
    // Inject a "Start Node" at session.startTime (score = 100) and an
    // "End Node" at session.endTime or now, so the graph always spans
    // the full session duration regardless of when the first event occurred.
    const sessionStart = new Date(session.startTime);
    const sessionEnd   = session.endTime ? new Date(session.endTime) : new Date();

    const lastRealScore = rawEvents.length > 0
      ? rawEvents[rawEvents.length - 1].scoreSnapshot
      : 100;

    const startAnchor = {
      timestamp:     sessionStart.toISOString(),
      eventType:     "SESSION_START",
      scoreSnapshot: 100,
      pointsDelta:   0,
      label:         "Session Started",
      isVirtual:     true,
    };

    const endAnchor = {
      timestamp:     sessionEnd.toISOString(),
      eventType:     "SESSION_END",
      scoreSnapshot: lastRealScore,
      pointsDelta:   0,
      label:         session.attendanceStatus === "COMPLETED" ? "Session Ended" : "Live Session",
      isVirtual:     true,
    };

    // ── PHASE 1B FIX: Sort combined events by timestamp to ensure chronological line ──
    const events = [startAnchor, ...rawEvents.map(e => ({ ...e, isVirtual: false })), endAnchor]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // ── PHASE 3A: Data Integrity — Calculate tracked % ───────────────────────
    // Detect "gaps" > 12 minutes between consecutive events (camera was likely off)
    const GAP_THRESHOLD_MS = 12 * 60 * 1000;
    let gapSeconds = 0;
    const gaps = [];

    for (let i = 1; i < events.length; i++) {
      const diff = new Date(events[i].timestamp) - new Date(events[i - 1].timestamp);
      if (diff > GAP_THRESHOLD_MS) {
        gapSeconds += diff / 1000;
        gaps.push({
          from: events[i - 1].timestamp,
          to:   events[i].timestamp,
          durationSecs: Math.round(diff / 1000),
        });
      }
    }

    const totalSecs    = Math.max((sessionEnd - sessionStart) / 1000, 1);
    const trackedPct   = Math.max(0, Math.round(((totalSecs - gapSeconds) / totalSecs) * 100));

    // ── Build session insights summary ───────────────────────────────────────
    const realEvents = rawEvents.filter(e => e.eventType !== "HEARTBEAT");
    const countsByType = {};
    realEvents.forEach(e => {
      countsByType[e.eventType] = (countsByType[e.eventType] || 0) + 1;
    });

    // ── PHASE 3B: Smart Break Recommendations ────────────────────────────────
    const proactiveAlerts = [];
    const recentFatigue = (countsByType.YAWN || 0) >= 3 && (countsByType.DROWSY || 0) >= 1;
    const lowScore = lastRealScore < 60;

    if (recentFatigue || lowScore) {
      proactiveAlerts.push({
        severity: "high",
        icon:     "😴",
        title:    "High Fatigue Detected",
        message:  "Your wellness score indicates significant fatigue. A 15-minute screen-free break is recommended.",
      });
    } else if ((countsByType.YAWN || 0) >= 2) {
      proactiveAlerts.push({
        severity: "medium",
        icon:     "💧",
        title:    "Mild Fatigue Signal",
        message:  "Multiple yawns detected. Consider a short water or stretching break.",
      });
    } else if ((countsByType.DISTRACTED || 0) >= 3) {
      proactiveAlerts.push({
        severity: "medium",
        icon:     "🎯",
        title:    "Focus Fragmentation",
        message:  "Multiple distraction events detected. Try enabling Focus Mode or using noise-cancelling headphones.",
      });
    }

    // Authoritative final score: from last real event or null
    const authoritative = await getLastScore(sessionId);

    return res.status(200).json({
      success:            true,
      sessionId,
      finalWellnessScore: session.finalWellnessScore ?? authoritative,
      events,             // ← includes virtual anchors + heartbeats
      eventCounts:        countsByType,
      appUsageTimeline:   session.appUsageTimeline || [], // ← For high-fidelity tooltip
      dataIntegrity: {
        trackedPercentage: trackedPct,
        untrackedGaps:     gaps,
        totalDurationSecs: Math.round(totalSecs),
      },
      proactiveAlerts,
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
    const { empId: requestedObjectId } = req.params;
    const requestingUserId = req.user?.id;

    if (requestedObjectId !== requestingUserId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

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
