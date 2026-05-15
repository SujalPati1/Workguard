const User = require("../models/User");

// Create employee from admin panel
exports.createEmployee = async (req, res) => {
  try {
    const { empId, email, password, fullName, department } = req.body;

    if (!empId || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "empId, email, and password are required",
      });
    }

    const existing = await User.findOne({ $or: [{ email }, { empId }] });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An employee with the same empId or email already exists",
      });
    }

    const employee = new User({
      empId,
      email,
      password,
      fullName: fullName || "",
      department: department || "",
      role: "employee",
    });

    await employee.save();

    res.status(201).json({
      success: true,
      message: "Employee created successfully",
      employee: {
        id: employee._id,
        empId: employee.empId,
        email: employee.email,
        fullName: employee.fullName,
        department: employee.department,
        role: employee.role,
      },
    });
  } catch (err) {
    console.error("Admin Create Employee Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while creating employee",
      error: err.message,
    });
  }
};

// List all employees
exports.listEmployees = async (req, res) => {
  try {
    const employees = await User.find({ role: "employee" }).select(
      "-password -refreshToken"
    );

    res.status(200).json({
      success: true,
      employees,
    });
  } catch (err) {
    console.error("Admin List Employees Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching employee list",
      error: err.message,
    });
  }
};
