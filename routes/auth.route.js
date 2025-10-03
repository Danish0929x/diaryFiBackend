const express = require("express")
const passport = require("passport")
const { body } = require("express-validator")
const authController = require("../controllers/auth.controller")
const auth = require("../middleware/auth")
const userModel = require("../models/user.model")


const router = express.Router()

// Validation rules
const registerValidation = [
  body("name").trim().isLength({ min: 2 }).withMessage("Name must be at least 2 characters"),
  body("email").isEmail().normalizeEmail().withMessage("Please provide a valid email"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain at least one uppercase letter, one lowercase letter, and one number"),
]

const loginValidation = [
  body("email").isEmail().normalizeEmail().withMessage("Please provide a valid email"),
  body("password").notEmpty().withMessage("Password is required"),
]

const forgotPasswordValidation = [body("email").isEmail().normalizeEmail().withMessage("Please provide a valid email")]

const resetPasswordValidation = [
  body("token").notEmpty().withMessage("Reset token is required"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Password must contain at least one uppercase letter, one lowercase letter, and one number"),
]

// Authentication routes
router.post("/register", registerValidation, authController.register)
router.post("/verify-email", authController.verifyEmail)
router.post("/resend-verification", authController.resendVerification)
router.post("/login", loginValidation, authController.login)
router.post("/forgot-password", forgotPasswordValidation, authController.forgotPassword)
router.post("/reset-password", resetPasswordValidation, authController.resetPassword)
router.get("/me", auth, authController.getMe)

// Google OAuth routes
router.get(
  "/google",
  passport.authenticate("google", { 
    scope: ["profile", "email"],
    prompt: "select_account"
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { 
    failureRedirect: `${process.env.CLIENT_URL}/login?error=google_auth_failed`,
    session: false
   }),
  authController.googleSuccess,
)

router.post("/google", async (req, res) => {
  try {
    console.log("=== Google Token Verification Route ===");
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "ID token is required"
      });
    }

    console.log("Received ID Token:", idToken.substring(0, 50) + "...");

    // Verify the token with Google
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    console.log("Google payload:", payload);
    
    const { sub: googleId, email, name, picture } = payload;

    // Find or create user (similar to your existing Google strategy logic)
    let user = await userModel.findOneAndUpdate(
      { googleId },
      { $set: { lastLogin: new Date() } },
      { new: true }
    );

    if (user) {
      console.log("Existing Google user found");
    } else {
      // Check if user exists with this email
      user = await userModel.findOneAndUpdate(
        { email },
        {
          $set: {
            googleId,
            lastLogin: new Date(),
            isEmailVerified: true,
            ...(picture && !user?.avatar ? { avatar: picture } : {})
          },
          $addToSet: { authMethods: "google" }
        },
        { new: true }
      );

      if (!user) {
        // Create new user
        console.log("Creating new Google user");
        user = await userModel.create({
          googleId,
          name,
          email,
          avatar: picture || "",
          authMethods: ["google"],
          isEmailVerified: true,
          lastLogin: new Date()
        });
      }
    }

    // Generate JWT token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    // Update last login
    await userModel.findByIdAndUpdate(user._id, {
      lastLogin: new Date()
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authMethods: user.authMethods,
        isEmailVerified: user.isEmailVerified
      }
    });

  } catch (error) {
    console.error("❌ Google token verification error:", error);
    res.status(400).json({
      success: false,
      message: "Google authentication failed",
      error: error.message
    });
  }
});



// Apple OAuth routes with improved error handling
router.get(
  "/apple",
  (req, res, next) => {
    console.log("Starting Apple OAuth flow");
    next();
  },
  passport.authenticate("apple", {
    scope: ["name", "email"],
  })
);

// Apple callback - handle both GET and POST
router.get(
  "/apple/callback",
  (req, res, next) => {
    console.log("Apple GET callback hit");
    console.log("Query params:", req.query);
    next();
  },
  passport.authenticate("apple", {
    failureRedirect: `${process.env.CLIENT_URL}/login?error=apple_auth_failed`,
    session: false
  }),
  authController.appleSuccess
);

router.post(
  "/apple/callback",
  (req, res, next) => {
    console.log("Apple POST callback hit");
    console.log("Body:", req.body);
    next();
  },
  passport.authenticate("apple", {
    failureRedirect: `${process.env.CLIENT_URL}/login?error=apple_auth_failed`,
    session: false
  }),
  authController.appleSuccess
);

// Add error handling middleware for OAuth routes
router.use((error, req, res, next) => {
  console.error("OAuth Error:", error);
  
  if (req.originalUrl.includes('/auth/apple')) {
    return res.redirect(`${process.env.CLIENT_URL}/login?error=apple_oauth_error&details=${encodeURIComponent(error.message)}`);
  }
  
  if (req.originalUrl.includes('/auth/google')) {
    return res.redirect(`${process.env.CLIENT_URL}/login?error=google_oauth_error&details=${encodeURIComponent(error.message)}`);
  }
  
  next(error);
});

module.exports = router