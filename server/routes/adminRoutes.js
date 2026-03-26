const router = require("express").Router();
const { createEmployee, listEmployees } = require("../controllers/adminController");

// TODO: Add authMiddleware + admin role guard when ready
router.post("/admin/employees", createEmployee);
router.get("/admin/employees", listEmployees);

module.exports = router;
