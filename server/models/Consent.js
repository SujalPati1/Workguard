const mongoose = require("mongoose");

const consentSchema = new mongoose.Schema(
{
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true
  },

  trackingEnabled: { type: Boolean, default: true },
  wellnessEnabled: { type: Boolean, default: true },
  cameraEnabled: { type: Boolean, default: false },
  deleteAllowed: { type: Boolean, default: true },
  retention: { type: String, default: '30 days' },
},
{ timestamps: true }
);

module.exports = mongoose.model("Consent", consentSchema);