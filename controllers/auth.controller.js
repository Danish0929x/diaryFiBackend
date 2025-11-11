const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const User = require("../models/user.model");
const {
  sendPasswordResetEmail,
  sendOtpEmail,
} = require("../utils/emailService");

// Helper functions
const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Register User with Email/Password
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    const { name, email, password } = req.body;

    // Check existing user with atomic operation
    const existingUser = await User.findOne({ email }).select("+authMethods");
    if (existingUser) {
      // Scenario 1: Existing Google user wants to add email/password
      if (
        existingUser.authMethods.includes("google") &&
        !existingUser.authMethods.includes("email")
      ) {
        // Update password and generate OTP
        existingUser.password = password; // Will be hashed via pre-save hook
        const otp = existingUser.createEmailOtp();
        await existingUser.save();

        await sendOtpEmail(email, otp, existingUser.name);
        console.log(`✅ OTP sent to ${email} for account linking: ${otp}`);

        return res.status(200).json({
          success: true,
          message:
            "Please verify your email with the OTP sent to link password to your Google account",
          requiresVerification: true,
          linkingAccount: true,
          email: email,
        });
      }
      return res.status(400).json({
        success: false,
        message: "Account already exists with this email",
      });
    }

    // New email/password registration with OTP
    const user = await User.create({
      name,
      email,
      password,
      authMethods: ["email"],
      isEmailVerified: false,
    });

    // Generate and send OTP
    const otp = user.createEmailOtp();
    await user.save();
    await sendOtpEmail(email, otp, name);

    console.log(`✅ OTP sent to ${email}: ${otp}`); // For development/testing

    return res.status(201).json({
      success: true,
      message:
        "Registration successful! Please check your email for the verification code.",
      requiresVerification: true,
      email: email,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Registration failed",
    });
  }
};

// Login User
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
    console.log(req.body);
    const user = await User.findOne({ email }).select("+password +authMethods");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Handle Google-only users trying password login
    if (!user.authMethods.includes("email")) {
      return res.status(400).json({
        success: false,
        message: "Account uses Google login. Please sign in with Google.",
        suggestGoogleLogin: true,
        requiresPasswordSetup: !user.authMethods.includes("email"),
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await User.findByIdAndUpdate(user._id, {
        $inc: { loginAttempts: 1 },
        ...(user.loginAttempts + 1 >= 5 && {
          isLocked: true,
          lockUntil: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        }),
      });
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check email verification
    if (!user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your email first",
        requiresVerification: true,
      });
    }

    // Successful login
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $set: { lastLogin: new Date() },
        $unset: { loginAttempts: 1, lockUntil: 1 },
      },
      { new: true }
    );

    const authToken = generateToken(updatedUser._id);
    return res.json({
      success: true,
      message: "Login successful",
      token: authToken,
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        authMethods: updatedUser.authMethods,
        isEmailVerified: updatedUser.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

// Handle Password Setup for Google Users
const handlePasswordSetup = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if user exists
      return res.json({
        success: true,
        message: "If account exists, password setup link sent",
      });
    }

    // Only allow for Google-only users
    if (
      !user.authMethods.includes("google") ||
      user.authMethods.includes("email")
    ) {
      return res.json({
        success: true,
        message: "If account exists, password setup link sent",
      });
    }

    const setupToken = generateVerificationToken();
    await User.findByIdAndUpdate(user._id, {
      passwordResetToken: setupToken,
      passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    await sendPasswordResetEmail(email, setupToken, "setup-password");
    return res.json({
      success: true,
      message: "Password setup link sent if account exists",
    });
  } catch (error) {
    console.error("Password setup error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send password setup link",
    });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const user = await User.findOneAndUpdate(
      {
        passwordResetToken: token,
        passwordResetExpires: { $gt: Date.now() },
      },
      {
        $set: { password },
        $addToSet: { authMethods: "email" },
        $unset: { passwordResetToken: 1, passwordResetExpires: 1 },
      },
      { new: true }
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Password reset error:", error);
    return res.status(500).json({
      success: false,
      message: "Password reset failed",
    });
  }
};
// Get Current User
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "-password -emailVerificationToken -passwordResetToken"
    );
    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Google OAuth Success
const googleSuccess = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
    }
    // Check if Google-only user needs to set password
    const needsPasswordSetup =
      req.user.authMethods.includes("google") &&
      !req.user.authMethods.includes("email");
    const token = generateToken(req.user._id);
    const redirectUrl = needsPasswordSetup
      ? `${process.env.CLIENT_URL}/auth/success?token=${token}&action=set-password`
      : `${process.env.CLIENT_URL}/auth/success?token=${token}`;
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("Google auth error:", error);
    return res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
  }
};

// Apple OAuth Success
const appleSuccess = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
    }
    // Check if Apple-only user needs to set password
    const needsPasswordSetup =
      req.user.authMethods.includes("apple") &&
      !req.user.authMethods.includes("email");
    const token = generateToken(req.user._id);
    const redirectUrl = needsPasswordSetup
      ? `${process.env.CLIENT_URL}/auth/success?token=${token}&action=set-password`
      : `${process.env.CLIENT_URL}/auth/success?token=${token}`;
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("Apple auth error:", error);
    return res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
  }
};

// Verify OTP
const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    // Find user with OTP fields
    const user = await User.findOne({ email }).select(
      "+emailOtp +emailOtpExpires +otpAttempts"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify OTP using the model method
    const verificationResult = user.verifyOtp(otp);

    if (!verificationResult.success) {
      // Save updated attempts count
      await user.save();
      return res.status(400).json({
        success: false,
        message: verificationResult.message,
      });
    }

    // OTP verified successfully - update user
    user.isEmailVerified = true;
    user.emailOtp = undefined;
    user.emailOtpExpires = undefined;
    user.otpAttempts = 0;
    await user.save();

    // Generate JWT token
    const authToken = generateToken(user._id);

    return res.json({
      success: true,
      message: "Email verified successfully!",
      token: authToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isEmailVerified: true,
        authMethods: user.authMethods,
      },
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};

// Resend OTP
const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified",
      });
    }

    // Generate new OTP
    const otp = user.createEmailOtp();
    await user.save();

    // Send OTP email
    await sendOtpEmail(email, otp, user.name);

    console.log(`✅ OTP resent to ${email}: ${otp}`); // For development/testing

    return res.json({
      success: true,
      message: "Verification code sent successfully",
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to resend verification code",
    });
  }
};

module.exports = {
  register,
  verifyOtp,
  resendOtp,
  login,
  forgotPassword: handlePasswordSetup, // Reused for Google/Apple users
  resetPassword,
  getMe,
  googleSuccess,
  appleSuccess,
};
