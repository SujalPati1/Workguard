const Session = require("../models/Session.model");
const Consent = require("../models/Consent");

// Shared attendance thresholds — read from env vars so they match reportController.
const PRESENT_THRESHOLD = parseInt(process.env.PRESENT_ACTIVE_SECONDS || "14400", 10);
const PARTIAL_THRESHOLD = parseInt(process.env.PARTIAL_ACTIVE_SECONDS || "7200",  10);

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

  let result = "ABSENT";
  if ((session.activeTime || 0) >= PRESENT_THRESHOLD) result = "PRESENT";
  else if ((session.activeTime || 0) >= PARTIAL_THRESHOLD) result = "PARTIAL";

  session.attendanceResult = result;
  session.attendanceStatus = "COMPLETED";
  await session.save();
  return session;
};

// ✅ START SESSION
const startSession = async (req, res) => {
  try {
    const { empId, focusMode, workStatus } = req.body;

    if (!empId) {
      return res.status(400).json({ message: "empId is required" });
    }

    // ✅ Optional: Consent Check (Employee Control)
    // Uncomment if you want to enforce consent checking
    // const consent = await Consent.findOne({ empId });
    // if (!consent || consent.trackingEnabled === false) {
    //   return res.status(403).json({
    //     message: "❌ Tracking disabled by employee consent",
    //   });
    // }

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

    return res.status(201).json({
      message: "✅ Session started",
      sessionId: newSession._id,
      session: newSession,
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

    // ✅ Store active & idle time sent from frontend
    session.activeTime = activeSeconds || 0;
    session.idleTime = idleSeconds || 0;
    session.waitingTime = waitingSeconds || 0;
    session.breakTime = breakSeconds || 0;

    // ✅ Calculate attendance result (2 minutes = 120 seconds minimum for PRESENT)
    let result = "ABSENT";
    if (session.activeTime >= PRESENT_THRESHOLD) result = "PRESENT";
    else if (session.activeTime >= PARTIAL_THRESHOLD) result = "PARTIAL";

    session.attendanceResult = result;
    session.attendanceStatus = "COMPLETED";

    await session.save();

    return res.status(200).json({
      message: "✅ Session ended + Attendance calculated",
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
    const { empId } = req.body;

    if (!empId) {
      return res.status(400).json({ message: "empId is required" });
    }

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

    return res.status(200).json({
      message: "✅ Session resumed",
      sessionId: session._id,
      session,
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
    const { sessionId, activeSeconds, idleSeconds, waitingSeconds, breakSeconds, workStatus } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
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

    await session.save();

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

// ✅ GET TODAY REPORT
const getTodayReport = async (req, res) => {
  try {
    const { empId } = req.params;

    if (!empId) {
      return res.status(400).json({ message: "empId is required" });
    }

    // ✅ Start and end of today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // ✅ Fetch today's completed sessions
    const sessions = await Session.find({
      empId,
      attendanceStatus: "COMPLETED",
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    });

    let totalWorkTime = 0;
    let totalActive = 0;
    let totalIdle = 0;
    let totalWaiting = 0;
    let totalBreak = 0;

    sessions.forEach((s) => {
      totalWorkTime += s.totalDuration || 0;
      totalActive += s.activeTime || 0;
      totalIdle += s.idleTime || 0;
      totalWaiting += s.waitingTime || 0;
      totalBreak += s.breakTime || 0;
    });

    // ✅ Focus score (percentage of active time)
    const focusScore =
      totalWorkTime > 0 ? Math.round((totalActive / totalWorkTime) * 100) : 0;

    // ✅ Attendance status (2 minutes = 120 seconds minimum for PRESENT)
    let attendanceStatus = "ABSENT";
    if (totalActive >= PRESENT_THRESHOLD) attendanceStatus = "PRESENT";
    else if (totalActive >= PARTIAL_THRESHOLD) attendanceStatus = "PARTIAL";

    return res.status(200).json({
      empId,
      date: new Date().toISOString().slice(0, 10),
      sessionCount: sessions.length,
      totalWorkTime, // seconds
      totalActive,
      totalIdle,
      totalWaiting,
      totalBreak,
      focusScore, // %
      attendanceStatus,
      sessions, // All sessions from today
    });
  } catch (error) {
    return res.status(500).json({
      message: "❌ Error generating report",
      error: error.message,
    });
  }
};

// ✅ GET SESSION BY ID (For viewing single session details)
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
