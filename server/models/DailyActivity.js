const mongoose = require("mongoose");

/**
 * DailyActivity — Single "source of truth" for an employee's entire work day.
 *
 * Attendance is decided by:
 *   1. totalPlatformTime  — how long the app was open (accumulated via heartbeat pings)
 *   2. Liveness compliance — how many randomized checks were PASSED vs MISSED
 *
 * Work sessions are OPTIONAL and feed productivity metrics only.
 */
const livenessSlotSchema = new mongoose.Schema(
  {
    slotIndex:   { type: Number, required: true },   // 1, 2, or 3

    status: {
      type:    String,
      enum:    ["PENDING", "PASSED", "MISSED"],
      default: "PENDING",
    },

    // The required number of platform seconds (accumulated via heartbeats) before this popup appears
    triggerPlatformSeconds: { type: Number, default: 0 },

    // When the popup was shown (set when the modal opens)
    shownAt:     { type: Date, default: null },

    // When the employee actually verified (null if MISSED)
    completedAt: { type: Date, default: null },

    // Biometric confidence score (0-100)
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const dailyActivitySchema = new mongoose.Schema(
  {
    empId: { type: String, required: true },

    // Calendar date string "YYYY-MM-DD" — unique per employee per day
    date: { type: String, required: true },

    // ── Liveness Compliance ───────────────────────────────────────────────────
    livenessSlots: {
      type:    [livenessSlotSchema],
      default: () => [
        { slotIndex: 1, status: "PENDING" },
        { slotIndex: 2, status: "PENDING" },
        { slotIndex: 3, status: "PENDING" },
      ],
    },
    totalLivenessPassed:   { type: Number, default: 0 },
    totalLivenessRequired: { type: Number, default: 3 },

    // ── Platform Presence (Heartbeat-driven) ─────────────────────────────────
    // Accumulated seconds the app was open. Incremented by heartbeat pings.
    // This is the PRIMARY metric for attendance — independent of work sessions.
    totalPlatformTime: { type: Number, default: 0 },  // seconds

    // Timestamp of the last received heartbeat ping
    lastHeartbeat: { type: Date, default: null },

    // ── Session Time Aggregation (productivity metrics, NOT attendance) ───────
    totalActiveTime:  { type: Number, default: 0 },   // seconds
    totalIdleTime:    { type: Number, default: 0 },
    totalWaitingTime: { type: Number, default: 0 },
    totalBreakTime:   { type: Number, default: 0 },
    totalDuration:    { type: Number, default: 0 },   // wall-clock across sessions
    sessionCount:     { type: Number, default: 0 },

    // References to individual Session documents for drill-down
    sessions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Session" }],

    // ── Work Quality Insights ─────────────────────────────────────────────────
    firstLogin:        { type: Date, default: null },
    lastActivity:      { type: Date, default: null },
    averageFocusScore: { type: Number, default: 0 },
    distractionCount:  { type: Number, default: 0 },

    // ── Final Daily Verdict ───────────────────────────────────────────────────
    attendanceResult: {
      type:    String,
      enum:    ["ABSENT", "PARTIAL", "PRESENT"],
      default: "ABSENT",
    },
    complianceScore: { type: Number, default: 0 },  // 0–100 %
  },
  { timestamps: true }
);

// One record per employee per day — enforced at DB level
dailyActivitySchema.index({ empId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("DailyActivity", dailyActivitySchema);
