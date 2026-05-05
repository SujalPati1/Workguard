const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    empId: { type: String, required: true },

    startTime: { type: Date, required: true },
    endTime: { type: Date, default: null },

    // Time tracking (in seconds)
    totalDuration: { type: Number, default: 0 },
    activeTime: { type: Number, default: 0 },
    idleTime: { type: Number, default: 0 },
    waitingTime: { type: Number, default: 0 },
    breakTime: { type: Number, default: 0 },

    // Session configuration
    focusMode: { type: Boolean, default: false },
    workStatus: {
      type: String,
      enum: ["WORKING", "WAITING", "BREAK"],
      default: "WORKING",
    },

    // Attendance tracking (session lifecycle only — daily verdict is in DailyActivity)
    attendanceStatus: {
      type: String,
      enum: ["IN_PROGRESS", "COMPLETED", "PAUSED"],
      default: "IN_PROGRESS",
    },

    // Wellness score at end of session (0-100).
    // Starts at 100, adjusted by biometric events. Employee-facing only.
    finalWellnessScore: { type: Number, default: 100 },

    // Checkpoints history
    checkpoints: [
      {
        timestamp: { type: Date, default: Date.now },
        activeTime: { type: Number, default: 0 },
        idleTime: { type: Number, default: 0 },
        waitingTime: { type: Number, default: 0 },
        breakTime: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

// Compound index — covers the heavy queries in session & report controllers:
// Session.find({ empId, attendanceStatus, startTime: {$gte, $lte} })
sessionSchema.index({ empId: 1, attendanceStatus: 1, startTime: -1 });

module.exports = mongoose.model("Session", sessionSchema);
