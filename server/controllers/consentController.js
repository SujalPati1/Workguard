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

  await Consent.findOneAndUpdate(
    { userId },
    { ...req.body, userId },
    { upsert:true, new:true }
  );

  res.json({
    success:true,
    message:"Consent updated successfully"
  });

} catch(err){
  res.status(500).json({
    success:false,
    message:"Server error"
  });
}
};