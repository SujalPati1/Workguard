const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {

  const authHeader = req.headers.authorization;


  const token = authHeader?.split(" ")[1];


  if (!token) {
    return res.status(401).json({
      success:false,
      message:"Token missing"
    });
  }

  try {
    const decoded =
      jwt.verify(token, process.env.JWT_SECRET);

    req.user = { id: decoded.id };

    next();

  } catch (err) {
    // If it's just a routine expiration, don't flood the console. 
    // The frontend will catch the 401 and refresh the token.
    if (err.name !== "TokenExpiredError") {
      console.error("JWT AUTH ERROR:", err.message);
    }

    return res.status(401).json({
      success:false,
      message: err.name === "TokenExpiredError" ? "Token expired" : "Invalid Token"
    });
  }
};