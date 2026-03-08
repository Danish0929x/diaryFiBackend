const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const Admin = require("../models/admin.model");

// Helper function to generate JWT token
const generateToken = (adminId) =>
  jwt.sign({ adminId }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Admin Login
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;

    // Find admin by email
    const admin = await Admin.findOne({ email }).select("+password +loginAttempts +lockUntil");

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if admin is active
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "Admin account is inactive",
      });
    }

    // Check if account is locked (after 5 failed attempts)
    if (admin.lockUntil && new Date() < admin.lockUntil) {
      const remainingTime = Math.ceil((admin.lockUntil - new Date()) / 1000 / 60);
      return res.status(429).json({
        success: false,
        message: `Account locked. Try again in ${remainingTime} minutes.`,
      });
    }

    // Verify password
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      // Increment login attempts
      const newAttempts = admin.loginAttempts + 1;
      const updates = { loginAttempts: newAttempts };

      // Lock account after 5 failed attempts
      if (newAttempts >= 5) {
        updates.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      }

      await Admin.findByIdAndUpdate(admin._id, updates);

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Reset login attempts on successful login
    const updatedAdmin = await Admin.findByIdAndUpdate(
      admin._id,
      {
        $set: { lastLogin: new Date() },
        $unset: { loginAttempts: 1, lockUntil: 1 },
      },
      { new: true }
    );

    // Generate token
    const token = generateToken(updatedAdmin._id);

    return res.json({
      success: true,
      message: "Login successful",
      token,
      admin: {
        id: updatedAdmin._id,
        email: updatedAdmin.email,
        name: updatedAdmin.name,
        role: updatedAdmin.role,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get current admin
const getMe = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.adminId).select("-password");

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    return res.json({
      success: true,
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        isActive: admin.isActive,
      },
    });
  } catch (error) {
    console.error("Get admin error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin",
    });
  }
};

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const User = require("../models/user.model");
    const Entry = require("../models/entry.model");

    // Calculate date ranges
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

    // Get statistics with fallback to 0
    let totalUsers = 0;
    let totalEntries = 0;
    let newUsersThisWeek = 0;
    let entriesThisWeek = 0;
    let premiumUsers = 0;

    try {
      totalUsers = await User.countDocuments();
      totalEntries = await Entry.countDocuments();
      newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: weekAgo } });
      entriesThisWeek = await Entry.countDocuments({ createdAt: { $gte: weekAgo } });
      premiumUsers = await User.countDocuments({ isPremium: true });
    } catch (countError) {
      console.error("Count error:", countError.message);
    }

    console.log(`📊 Dashboard Stats:`, {
      totalUsers,
      totalEntries,
      newUsersThisWeek,
      entriesThisWeek,
      weekAgo: weekAgo.toISOString(),
    });

    // Get users data for the past 6 months
    let usersData = [];
    try {
      const usersByMonth = await User.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]);

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      usersData = usersByMonth.map((item) => ({
        month: monthNames[item._id.month - 1],
        users: item.count,
      }));
    } catch (aggError) {
      console.error("User aggregation error:", aggError.message);
    }

    // Get entries data for the past 5 weeks
    const entriesData = [];
    try {
      for (let i = 4; i >= 0; i--) {
        const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const count = await Entry.countDocuments({
          createdAt: { $gte: weekStart, $lt: weekEnd },
        });
        entriesData.push({
          week: `Week ${5 - i}`,
          entries: count,
        });
      }
    } catch (entriesError) {
      console.error("Entries aggregation error:", entriesError.message);
    }

    return res.json({
      success: true,
      stats: {
        totalUsers: totalUsers || 0,
        totalEntries: totalEntries || 0,
        newUsersThisWeek: newUsersThisWeek || 0,
        entriesThisWeek: entriesThisWeek || 0,
        premiumUsers: premiumUsers || 0,
      },
      usersData: usersData.length > 0 ? usersData : null,
      entriesData: entriesData.length > 0 ? entriesData : null,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get all users with entry counts
const getUsers = async (req, res) => {
  try {
    const User = require("../models/user.model");

    // Aggregate to include entry counts
    const users = await User.aggregate([
      {
        $lookup: {
          from: "entries",
          localField: "_id",
          foreignField: "user",
          as: "entries",
        },
      },
      {
        $addFields: {
          entryCount: { $size: "$entries" },
        },
      },
      {
        $project: {
          _id: 1,
          username: 1,
          email: 1,
          isEmailVerified: 1,
          createdAt: 1,
          isPremium: 1,
          entryCount: 1,
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return res.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get all entries
const getEntries = async (req, res) => {
  try {
    const Entry = require("../models/entry.model");

    const entries = await Entry.find()
      .populate("user", "username email")
      .select("title description user createdAt media location")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      entries,
    });
  } catch (error) {
    console.error("Get entries error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch entries",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Delete user and all their entries
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const User = require("../models/user.model");
    const Entry = require("../models/entry.model");

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Delete all entries for this user
    await Entry.deleteMany({ user: userId });

    // Delete the user
    await User.findByIdAndDelete(userId);

    return res.json({
      success: true,
      message: `User and ${await Entry.countDocuments({ user: userId })} entries deleted successfully`,
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get all coupons
const getCoupons = async (req, res) => {
  try {
    const Coupon = require("../models/coupon.model");

    const coupons = await Coupon.find().sort({ createdAt: -1 });

    return res.json({
      success: true,
      coupons,
    });
  } catch (error) {
    console.error("Get coupons error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch coupons",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Create new coupon
const createCoupon = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { code, type, discount, expiresAt, maxUsage } = req.body;
    const Coupon = require("../models/coupon.model");

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: "Coupon code already exists",
      });
    }

    // Validate discount percentage
    if (discount < 0 || discount > 100) {
      return res.status(400).json({
        success: false,
        message: "Discount must be between 0 and 100",
      });
    }

    // Validate expiration date
    const expirationDate = new Date(expiresAt);
    if (expirationDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Expiration date must be in the future",
      });
    }

    // Create coupon
    const coupon = new Coupon({
      code: code.toUpperCase(),
      type,
      discount,
      expiresAt: expirationDate,
      maxUsage: maxUsage || null,
    });

    await coupon.save();

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      coupon,
    });
  } catch (error) {
    console.error("Create coupon error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create coupon",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Delete coupon
const deleteCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    const Coupon = require("../models/coupon.model");

    // Check if coupon exists
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    // Delete the coupon
    await Coupon.findByIdAndDelete(couponId);

    return res.json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error) {
    console.error("Delete coupon error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete coupon",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  login,
  getMe,
  getDashboardStats,
  getUsers,
  getEntries,
  deleteUser,
  getCoupons,
  createCoupon,
  deleteCoupon,
};
