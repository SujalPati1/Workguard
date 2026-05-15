const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
} = require("../controllers/authController");

// Public routes
router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/refresh", refreshToken);

// Protected routes
router.post("/auth/logout", authMiddleware, logout);
router.get("/auth/me", authMiddleware, getCurrentUser);

module.exports = router;
