const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const { saveConsent, getConsent } = require("../controllers/consentController");

router.post(
  "/api/consent/save",
  auth,
  saveConsent
);

router.get(
  "/api/consent",
  auth,
  getConsent
);

module.exports = router;
