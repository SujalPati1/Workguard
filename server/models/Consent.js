const mongoose = require("mongoose");

const consentSchema = new mongoose.Schema(
{
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true
  },

  trackingEnabled: Boolean,
  wellnessEnabled: Boolean,
  postureEnabled: Boolean,
  cameraEnabled: Boolean,
  deleteAllowed: Boolean
},
{ timestamps: true }
);

module.exports = mongoose.model("Consent", consentSchema);