const express = require("express");
const { body, validationResult } = require("express-validator");
const adminController = require("../controllers/admin.controller");

const router = express.Router();

// Middleware to verify admin JWT token
const verifyAdminToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
    });
  }

  try {
    const decoded = require("jsonwebtoken").verify(
      token,
      process.env.JWT_SECRET
    );
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// POST /api/admin/login
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  adminController.login
);

// GET /api/admin/me
router.get("/me", verifyAdminToken, adminController.getMe);

// GET /api/admin/dashboard
router.get("/dashboard", verifyAdminToken, adminController.getDashboardStats);

// GET /api/admin/users
router.get("/users", verifyAdminToken, adminController.getUsers);

// GET /api/admin/entries
router.get("/entries", verifyAdminToken, adminController.getEntries);

// DELETE /api/admin/users/:id
router.delete("/users/:userId", verifyAdminToken, adminController.deleteUser);

// GET /api/admin/coupons
router.get("/coupons", verifyAdminToken, adminController.getCoupons);

// POST /api/admin/coupons
router.post(
  "/coupons",
  verifyAdminToken,
  [
    body("code").notEmpty().withMessage("Coupon code is required"),
    body("type").isIn(["monthly", "yearly"]).withMessage("Type must be monthly or yearly"),
    body("discount").isFloat({ min: 0, max: 100 }).withMessage("Discount must be between 0 and 100"),
    body("expiresAt").isISO8601().withMessage("Valid expiration date is required"),
  ],
  adminController.createCoupon
);

// DELETE /api/admin/coupons/:couponId
router.delete("/coupons/:couponId", verifyAdminToken, adminController.deleteCoupon);

module.exports = router;
