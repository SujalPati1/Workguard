const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {

  const authHeader = req.headers.authorization;

  console.log("HEADER:", authHeader);

  const token = authHeader?.split(" ")[1];

  console.log("TOKEN:", token);

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
    console.log("JWT ERROR:", err.message);

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
};