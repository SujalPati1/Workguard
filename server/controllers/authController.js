const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Generate JWT tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "2h",
  });

  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  return { accessToken, refreshToken };
};

// @route   POST /auth/register
// @desc    Register a new user
// @access  Public
exports.register = async (req, res) => {
  try {
    const { empId, email, password, fullName, department } = req.body;

    // Validation
    if (!empId || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide empId, email, and password",
      });
    }

    // Check if user already exists
    let user = await User.findOne({ $or: [{ email }, { empId }] });
    if (user) {
      return res.status(409).json({
        success: false,
        message: "User with that email or empId already exists",
      });
    }

    // Create user
    user = new User({
      empId,
      email,
      password,
      fullName: fullName || "",
      department: department || "",
    });

    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id);

    // Save refresh token to database
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      accessToken,
      refreshToken,
      employee: {
        id: user._id,
        empId: user.empId,
        email: user.email,
        fullName: user.fullName,
        department: user.department,
        role: user.role,
      },
    });
  } catch (err) {
    console.log("Register Error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error during registration",
      error: err.message,
    });
  }
};

// @route   POST /auth/login
// @desc    Login user
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password, empId } = req.body;

    // Validation
    if (!password || (!email && !empId)) {
      return res.status(400).json({
        success: false,
        message: "Please provide password and either email or empId",
      });
    }

    // Find user by email or empId
    const user = await User.findOne({
      $or: [{ email }, { empId }],
    });

    console.log(user)
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Match password
    const isMatch = await user.matchPassword(password);
    console.log(isMatch)
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "User account is deactivated",
      });
    }

    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);
    console.log(`access token: ${accessToken}, refresh token: ${refreshToken}`)
    
    // Save refresh token and update last login
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();
    
    // Set refresh token as httpOnly cookie (optional, for extra security)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    
    res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken,
      employee: {
        id: user._id,
        empId: user.empId,
        email: user.email,
        fullName: user.fullName,
        department: user.department,
        role: user.role,
      },
    });
  } catch (err) {
    console.log("Login Error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error during login",
      error: err.message,
    });
  }
};

// @route   POST /auth/refresh
// @desc    Refresh access token
// @access  Public (but requires valid refresh token)
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required",
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }

    // Generate new tokens
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      generateTokens(user._id);

    // Update refresh token in database
    user.refreshToken = newRefreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.log("Refresh Token Error:", err.message);
    res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token",
      error: err.message,
    });
  }
};

// @route   POST /auth/logout
// @desc    Logout user
// @access  Private
exports.logout = async (req, res) => {
  try {
    const userId = req.user.id;

    // Clear refresh token from database
    await User.findByIdAndUpdate(userId, { refreshToken: null });

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (err) {
    console.log("Logout Error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error during logout",
      error: err.message,
    });
  }
};

// @route   GET /auth/me
// @desc    Get current user
// @access  Private
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -refreshToken");

    res.status(200).json({
      success: true,
      employee: user,
    });
  } catch (err) {
    console.log("Get Current User Error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};
