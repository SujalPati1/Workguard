const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { saveConsent } = require("../controllers/consentController");

router.post(
  "/api/consent/save",
  auth,
  saveConsent
);

module.exports = router;