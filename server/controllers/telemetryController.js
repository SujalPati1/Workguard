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

    const daily = await getOrCreateDaily(empId);

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
