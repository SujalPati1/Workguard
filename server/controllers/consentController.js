const Consent = require("../models/Consent");
const User = require("../models/User");
const validateConsent = require("../utils/validateConsent");

// @route   POST /api/consent/save
// @access  Private
exports.saveConsent = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!validateConsent(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Invalid consent data — all boolean fields and retention string are required",
      });
    }

    // Look up the empId so we can store it alongside userId.
    // This fixes the Consent↔Session cross-linking inconsistency: Sessions
    // only store empId (String), Consent previously only stored userId (ObjectId).
    const user = await User.findById(userId).select("empId");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const saved = await Consent.findOneAndUpdate(
      { userId },
      { ...req.body, userId, empId: user.empId },
      { upsert: true, new: true, runValidators: true }
    );

    // ── DATA RETENTION: Re-expire historical data ───────────────────────────
    // If the user changed their retention policy, we must update the 'expiresAt' 
    // for all their existing logs so they are queued for deletion correctly.
    try {
      const match = req.body.retention.match(/(\d+)/);
      if (match) {
        const retentionDays = parseInt(match[1], 10);
        const WellnessLog = require("../models/WellnessLog");

        // We use the 'createdAt' date of each log as the anchor for expiration.
        // Formula: expiresAt = createdAt + new_retention_days
        // Note: MongoDB TTL index will handle the actual deletion.
        const logs = await WellnessLog.find({ empId: user.empId });
        
        const bulkOps = logs.map(log => {
          const newExpiry = new Date(log.createdAt);
          newExpiry.setDate(newExpiry.getDate() + retentionDays);
          return {
            updateOne: {
              filter: { _id: log._id },
              update: { $set: { expiresAt: newExpiry } }
            }
          };
        });

        if (bulkOps.length > 0) {
          await WellnessLog.bulkWrite(bulkOps);
        }
      }
    } catch (e) {
      console.warn("Failed to re-expire historical wellness logs:", e);
    }

    return res.status(200).json({
      success: true,
      data: saved,
      message: "Consent updated successfully",
    });
  } catch (err) {
    console.error("saveConsent error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error saving consent",
      error: err.message,
    });
  }
};

// @route   GET /api/consent
// @access  Private
exports.getConsent = async (req, res) => {
  try {
    const userId = req.user.id;

    const found = await Consent.findOne({ userId });

    if (!found) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "No consent record found",
      });
    }
    
    return res.status(200).json({
      success: true,
      data: found,
      message: "Consent record fetched",
    });
  } catch (err) {
    console.error("getConsent error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching consent",
      error: err.message,
    });
  }
};
