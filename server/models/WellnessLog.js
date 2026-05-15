// server/models/WellnessLog.js
/**
 * WellnessLog — A time-series log of biometric events for one session.
 *
 * Every alert triggered by the Python engine during a session is stored here.
 * This data is used to draw the Wellness Score graph on the employee's dashboard.
 *
 * Privacy: This data is STRICTLY employee-facing. The report controller
 * must NEVER expose this collection to admins or managers.
 */
const mongoose = require("mongoose");

const wellnessLogSchema = new mongoose.Schema(
  {
    empId: {
      type:     String,
      required: true,
      index:    true,
    },

    sessionId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Session",
      required: true,
      index:    true,
    },

    // When the event was triggered (engine wall-clock time)
    timestamp: {
      type:    Date,
      default: Date.now,
    },

    // Type of biometric event detected
    eventType: {
      type:    String,
      enum:    ["FOCUSED", "DROWSY", "DISTRACTED", "YAWN", "BAD_POSTURE", "BREAK_RECOVERY", "HEARTBEAT"],
      required: true,
    },

    // The running wellness score at the exact moment this event was logged.
    // Used to draw the Y-axis of the wellness graph.
    scoreSnapshot: {
      type:    Number,
      default: 100,
      min:     0,
      max:     100,
    },

    // Optional: points delta applied by this event (+2, -1, -3, etc.)
    pointsDelta: {
      type:    Number,
      default: 0,
    },

    // Optional: human-readable label for the hover tooltip on the graph
    // e.g., "Yawn Detected", "Focus Streak (+2 pts)"
    label: {
      type:    String,
      default: "",
    },
    // Data Retention: MongoDB TTL index will automatically delete this document
    // when the clock hits this date. Calculated based on user consent.
    expiresAt: {
      type:  Date,
    },
  },
  { timestamps: true }
);

// TTL Index: Delete document when expiresAt is reached
wellnessLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for the primary query: "give me all events for session X in order"
wellnessLogSchema.index({ sessionId: 1, timestamp: 1 });

module.exports = mongoose.model("WellnessLog", wellnessLogSchema);
