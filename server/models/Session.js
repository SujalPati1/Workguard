const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema(
  {
    empId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "paused", "completed"],
      default: "active",
    },
    focusMode: {
      type: Boolean,
      default: false,
    },
    workStatus: {
      type: String,
      enum: ["WORKING", "WAITING", "BREAK"],
      default: "WORKING",
    },
    // Time tracking in seconds
    activeSeconds: {
      type: Number,
      default: 0,
    },
    idleSeconds: {
      type: Number,
      default: 0,
    },
    waitingSeconds: {
      type: Number,
      default: 0,
    },
    breakSeconds: {
      type: Number,
      default: 0,
    },
    // Session timeline
    startedAt: {
      type: Date,
      default: Date.now,
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    resumedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    // Tracking metadata
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    checkpoints: [
      {
        timestamp: Date,
        activeSeconds: Number,
        idleSeconds: Number,
        waitingSeconds: Number,
        breakSeconds: Number,
        workStatus: String,
      },
    ],
  },
  { timestamps: true }
);

// Calculate total time across all categories
SessionSchema.methods.getTotalTime = function () {
  return this.activeSeconds + this.idleSeconds + this.waitingSeconds + this.breakSeconds;
};

// Calculate session duration (wall-clock time)
SessionSchema.methods.getSessionDuration = function () {
  const endTime = this.completedAt || this.pausedAt || new Date();
  return Math.floor((endTime - this.startedAt) / 1000);
};

module.exports = mongoose.model("Session", SessionSchema);
