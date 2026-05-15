// server/controllers/telemetryController.js
const { getOrCreateDaily, recalcAttendance } = require("./dailyActivityController");

/**
 * POST /api/telemetry/liveness
 *
 * Called by Electron when the Python engine confirms `is_live: true`.
 * Now records the liveness event on the DailyActivity record (not Session).
 *
 * Body: { empId, slotIndex, livenessScore, timestamp }
 */
exports.recordLiveness = async (req, res) => {
  try {
    const { empId, slotIndex, livenessScore, timestamp } = req.body;

    if (!empId) {
      return res.status(400).json({ success: false, message: "empId is required" });
    }

    if (!slotIndex) {
      return res.status(400).json({ success: false, message: "slotIndex is required" });
    }

    // Resolve the standardized empId string from the authenticated user
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const User = require("../models/User");
    const user = await User.findById(userId).select("empId");
    if (!user) return res.status(404).json({ message: "User not found" });
    const empIdStr = user.empId;

    const daily = await getOrCreateDaily(empIdStr);

    // Find the slot
    const slot = daily.livenessSlots.find((s) => s.slotIndex === slotIndex);
    if (!slot) {
      return res.status(400).json({ success: false, message: `Invalid slotIndex: ${slotIndex}` });
    }

    // Prevent re-verification
    if (slot.status === "PASSED") {
      return res.status(200).json({
        success: true,
        message: "Slot already verified",
        livenessSlots: daily.livenessSlots,
        attendanceResult: daily.attendanceResult,
      });
    }

    slot.status = "PASSED";
    slot.completedAt = timestamp ? new Date(timestamp * 1000) : new Date();
    slot.score = livenessScore || 0;

    daily.lastActivity = new Date();
    recalcAttendance(daily);

    await daily.save();

    return res.status(200).json({
      success: true,
      message: `Liveness slot ${slotIndex} verified`,
      totalLivenessPassed: daily.totalLivenessPassed,
      complianceScore: daily.complianceScore,
      attendanceResult: daily.attendanceResult,
    });
  } catch (err) {
    console.error("recordLiveness error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error recording liveness",
      error: err.message,
    });
  }
};

/**
 * POST /api/telemetry/wellness
 *
 * Called by the React frontend every 60 seconds during an active work session.
 * Accumulates biometric wellness signals into the DailyActivity record so that
 * the Focus Score calculation has real quality data, not just time ratios.
 *
 * Body: {
 *   empId,
 *   strainScore,      // float 0-1  — cognitive_tracker output
 *   flowDurationMins, // int        — current continuous deep-work block
 *   isFragmented,     // bool       — strain above fragmentation threshold
 *   isIdle,           // bool       — multi-signal idle verdict from SessionContext
 *   ear,              // float 0-1  — eye aspect ratio (0 if camera off)
 *   isYawning,        // bool
 *   status,           // string     — 'Focused'/'Drowsy'/'Distracted'/'Absent'/'Unknown'
 * }
 */
exports.wellnessSync = async (req, res) => {
  try {
    const {
      strainScore      = 0,
      flowDurationMins = 0,
      isFragmented     = false,
      isIdle           = false,
      status           = "Unknown",
    } = req.body;

    // Resolve the standardized empId string from the authenticated user
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const User = require("../models/User");
    const user = await User.findById(userId).select("empId");
    if (!user) return res.status(404).json({ message: "User not found" });
    const empIdStr = user.empId;

    const daily = await getOrCreateDaily(empIdStr);

    // ── Rolling average for strain score ─────────────────────────────────────
    // Formula: new_avg = (old_avg * n + new_value) / (n + 1)
    const n = daily.wellnessPingCount || 0;
    daily.averageStrainScore = ((daily.averageStrainScore * n) + strainScore) / (n + 1);
    daily.wellnessPingCount  = n + 1;

    // ── Max flow duration seen so far today ──────────────────────────────────
    if (flowDurationMins > (daily.flowDurationMins || 0)) {
      daily.flowDurationMins = flowDurationMins;
    }

    // ── Distraction count: increment when employee was absent from camera ─────
    // isIdle covers all signals (camera absent + kinematic + off-task)
    if (isIdle || status === "Absent" || status === "Distracted") {
      daily.totalDistractions = (daily.totalDistractions || 0) + 1;
    }

    daily.lastActivity = new Date();
    await daily.save();

    return res.status(200).json({
      success:            true,
      message:            "Wellness synced",
      averageStrainScore: daily.averageStrainScore,
      flowDurationMins:   daily.flowDurationMins,
      totalDistractions:  daily.totalDistractions,
    });
  } catch (err) {
    console.error("wellnessSync error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error syncing wellness data",
      error: err.message,
    });
  }
};
