const mongoose = require("mongoose");

const consentSchema = new mongoose.Schema(
  {
    // Mongo ObjectId reference — primary key used by auth/consent endpoints
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      ref: "User",
    },

    // Human-readable employee ID — mirrors Session.empId so the two models
    // can be cross-linked without additional joins through the User collection.
    // sparse:true lets legacy documents without this field coexist.
    empId: {
      type: String,
      trim: true,
      default: null,
      index: { sparse: true, unique: true },
    },

    trackingEnabled: { type: Boolean, default: true },
    wellnessEnabled: { type: Boolean, default: true },
    cameraEnabled:   { type: Boolean, default: false },
    deleteAllowed:   { type: Boolean, default: true },
    retention:       { type: String,  default: "30 days" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Consent", consentSchema);