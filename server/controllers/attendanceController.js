const Session = require("../models/Session");

// ===== START NEW SESSION =====
exports.startSession = async (req, res) => {
  try {
    const { empId, focusMode, workStatus } = req.body;

    if (!empId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    // Check if there's already an active session
    const existingSession = await Session.findOne({
      empId,
      status: { $in: ["active", "paused"] },
    });

    if (existingSession) {
      return res.status(400).json({
        error: "Session already in progress. Resume or complete it first.",
        session: existingSession,
      });
    }

    // Create new session
    const session = new Session({
      empId,
      focusMode: focusMode || false,
      workStatus: workStatus || "WORKING",
      status: "active",
      startedAt: new Date(),
      lastActivityAt: new Date(),
    });

    await session.save();

    res.status(201).json({
      success: true,
      message: "Session started",
      session,
    });
  } catch (error) {
    console.error("Start session error:", error);
    res.status(500).json({ error: "Failed to start session" });
  }
};

// ===== RESUME SESSION =====
exports.resumeSession = async (req, res) => {
  try {
    const { empId } = req.body;

    if (!empId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    // Find paused or active session
    let session = await Session.findOne({
      empId,
      status: { $in: ["active", "paused"] },
    }).sort({ startedAt: -1 });

    if (!session) {
      return res.status(404).json({
        error: "No active session found",
        canResume: false,
      });
    }

    // If paused, resume it
    if (session.status === "paused") {
      session.status = "active";
      session.resumedAt = new Date();
      session.lastActivityAt = new Date();
      await session.save();
    }

    res.status(200).json({
      success: true,
      message: "Session resumed",
      session,
      canResume: true,
      activeSeconds: session.activeSeconds,
      idleSeconds: session.idleSeconds,
      waitingSeconds: session.waitingSeconds,
      breakSeconds: session.breakSeconds,
      sessionId: session._id,
    });
  } catch (error) {
    console.error("Resume session error:", error);
    res.status(500).json({ error: "Failed to resume session" });
  }
};

// ===== CHECKPOINT (Update session during runtime) =====
exports.checkpoint = async (req, res) => {
  try {
    const { sessionId, activeSeconds, idleSeconds, waitingSeconds, breakSeconds, workStatus } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required" });
    }

    const session = await Session.findByIdAndUpdate(
      sessionId,
      {
        activeSeconds: activeSeconds || 0,
        idleSeconds: idleSeconds || 0,
        waitingSeconds: waitingSeconds || 0,
        breakSeconds: breakSeconds || 0,
        workStatus: workStatus || session.workStatus,
        lastActivityAt: new Date(),
      },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Add checkpoint to history
    session.checkpoints.push({
      timestamp: new Date(),
      activeSeconds,
      idleSeconds,
      waitingSeconds,
      breakSeconds,
      workStatus,
    });

    // Keep only last 100 checkpoints to avoid huge documents
    if (session.checkpoints.length > 100) {
      session.checkpoints = session.checkpoints.slice(-100);
    }

    await session.save();

    res.status(200).json({
      success: true,
      message: "Checkpoint saved",
      session,
    });
  } catch (error) {
    console.error("Checkpoint error:", error);
    res.status(500).json({ error: "Failed to save checkpoint" });
  }
};

// ===== STOP/COMPLETE SESSION =====
exports.stopSession = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required" });
    }

    const session = await Session.findByIdAndUpdate(
      sessionId,
      {
        status: "completed",
        completedAt: new Date(),
      },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.status(200).json({
      success: true,
      message: "Session completed",
      session,
      totalTime: session.getTotalTime(),
      sessionDuration: session.getSessionDuration(),
    });
  } catch (error) {
    console.error("Stop session error:", error);
    res.status(500).json({ error: "Failed to stop session" });
  }
};

// ===== GET SUMMARY FOR EMPLOYEE =====
exports.getSummary = async (req, res) => {
  try {
    const { empId } = req.params;

    if (!empId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    // Get all completed sessions for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sessions = await Session.find({
      empId,
      status: "completed",
      completedAt: { $gte: today },
    }).sort({ startedAt: -1 });

    // Calculate totals
    let totalActiveSeconds = 0;
    let totalIdleSeconds = 0;
    let totalWaitingSeconds = 0;
    let totalBreakSeconds = 0;

    sessions.forEach((session) => {
      totalActiveSeconds += session.activeSeconds;
      totalIdleSeconds += session.idleSeconds;
      totalWaitingSeconds += session.waitingSeconds;
      totalBreakSeconds += session.breakSeconds;
    });

    // Calculate productivity percentage
    const totalTime = totalActiveSeconds + totalIdleSeconds + totalWaitingSeconds + totalBreakSeconds;
    const productivityPercentage = totalTime > 0 ? Math.round((totalActiveSeconds / totalTime) * 100) : 0;

    res.status(200).json({
      success: true,
      empId,
      date: today,
      sessionCount: sessions.length,
      totalActiveSeconds,
      totalIdleSeconds,
      totalWaitingSeconds,
      totalBreakSeconds,
      totalTime,
      productivityPercentage,
      sessions,
    });
  } catch (error) {
    console.error("Get summary error:", error);
    res.status(500).json({ error: "Failed to get summary" });
  }
};

// ===== GET CURRENT/ACTIVE SESSION =====
exports.getActiveSession = async (req, res) => {
  try {
    const { empId } = req.params;

    if (!empId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    const session = await Session.findOne({
      empId,
      status: { $in: ["active", "paused"] },
    }).sort({ startedAt: -1 });

    if (!session) {
      return res.status(404).json({
        error: "No active session found",
        canResume: false,
      });
    }

    res.status(200).json({
      success: true,
      session,
      canResume: session.status === "paused",
      activeSeconds: session.activeSeconds,
      idleSeconds: session.idleSeconds,
      waitingSeconds: session.waitingSeconds,
      breakSeconds: session.breakSeconds,
      focusSeconds: session.activeSeconds, // For backward compatibility
      sessionId: session._id,
    });
  } catch (error) {
    console.error("Get active session error:", error);
    res.status(500).json({ error: "Failed to get session" });
  }
};

// ===== PAUSE SESSION =====
exports.pauseSession = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required" });
    }

    const session = await Session.findByIdAndUpdate(
      sessionId,
      {
        status: "paused",
        pausedAt: new Date(),
      },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.status(200).json({
      success: true,
      message: "Session paused",
      session,
    });
  } catch (error) {
    console.error("Pause session error:", error);
    res.status(500).json({ error: "Failed to pause session" });
  }
};
