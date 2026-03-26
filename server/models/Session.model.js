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

    // Attendance tracking
    attendanceStatus: {
      type: String,
      enum: ["IN_PROGRESS", "COMPLETED", "PAUSED"],
      default: "IN_PROGRESS",
    },

    attendanceResult: {
      type: String,
      enum: ["PRESENT", "PARTIAL", "ABSENT"],
      default: "ABSENT",
    },

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

module.exports = mongoose.model("Session", sessionSchema);
