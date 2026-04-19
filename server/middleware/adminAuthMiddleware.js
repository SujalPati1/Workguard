/**
 * adminAuthMiddleware.js
 * Validates requests to /api/admin/* routes using a static shared secret
 * passed as the "X-Admin-Key" header.
 *
 * This allows the admin portal to operate without a full JWT login flow
 * while still preventing anonymous internet access.
 * Set ADMIN_SECRET in server/.env before production deployment.
 */
module.exports = (req, res, next) => {
  const expectedKey = process.env.ADMIN_SECRET;

  // If ADMIN_SECRET is not configured, block all requests with a clear error.
  if (!expectedKey) {
    console.error("[AdminAuth] ADMIN_SECRET env var is not configured — blocking request.");
    return res.status(503).json({
      success: false,
      message: "Admin routes are not configured. Set ADMIN_SECRET in server/.env",
    });
  }

  const providedKey = req.headers["x-admin-key"];

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(403).json({
      success: false,
      message: "Unauthorized: valid X-Admin-Key header required",
    });
  }

  next();
};
