// server/routes/telemetryRoutes.js
const express = require("express");
const router  = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { recordLiveness } = require("../controllers/telemetryController");

// POST /api/telemetry/liveness
// Called by Electron (not the browser) — still requires a valid JWT
// because Electron stores the user's accessToken and passes it in headers.
router.post("/liveness", authMiddleware, recordLiveness);

module.exports = router;
