const router = require("express").Router();
const adminAuthMiddleware = require("../middleware/adminAuthMiddleware");
const { createEmployee, listEmployees } = require("../controllers/adminController");

// Both admin endpoints are protected by the ADMIN_SECRET key check.
// The admin portal must send "X-Admin-Key: <ADMIN_SECRET>" in every request.
// For future improvement: add JWT + role === "admin" guard once admin login is built.
router.post("/employees", adminAuthMiddleware, createEmployee);
router.get("/employees",  adminAuthMiddleware, listEmployees);

module.exports = router;
