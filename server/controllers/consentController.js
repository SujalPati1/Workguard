const mongoose = require("mongoose");
const Consent = require("../models/Consent");
const validateConsent = require("../utils/validateConsent");

exports.saveConsent = async (req,res)=>{
  try {
    const userId = req.user.id;

    if(!validateConsent(req.body))
      return res.status(400).json({
        success:false,
        message:"Invalid data"
      });
    console.log(req.body)
    const saved = await Consent.findOneAndUpdate(
      { userId },
      { ...req.body, userId },
      { upsert:true, new:true }
    );
    console.log(saved)

    res.json({
      success:true,
      data: saved,
      message:"Consent updated successfully"
    });
  } catch(err){
    res.status(500).json({
      success:false,
      message:"Server error"
    });
  }
};

exports.getConsent = async (req,res) => {
  try {
    const userId = req.user.id;

    const found = await Consent.findOne({ userId });

    if (!found) {
      return res.json({
        success: true,
        data: null,
        message: "No consent record found"
      });
    }

    res.json({
      success: true,
      data: found,
      message: "Consent record fetched"
    });
  } catch (err) {
    res.status(500).json({
      success:false,
      message:"Server error"
    });
  }
};