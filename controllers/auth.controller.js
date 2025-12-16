const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const User = require("../models/user.model");
const {
  sendPasswordResetEmail,
  sendOtpEmail,
  sendTempPasswordEmail,
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
        picture: updatedUser.avatar,
        googleId: updatedUser.googleId,
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
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.avatar,
        googleId: user.googleId,
        authMethods: user.authMethods,
        isEmailVerified: user.isEmailVerified,
      },
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
    console.log('🍎 [APPLE_SUCCESS] Callback received');
    console.log('🍎 [APPLE_SUCCESS] User:', req.user ? req.user._id : 'No user');

    if (!req.user) {
      console.error('🍎 [APPLE_SUCCESS] No user found');
      // Return simple HTML without window.close() - let the package handle it
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sign in with Apple</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                     display: flex; justify-content: center; align-items: center;
                     min-height: 100vh; margin: 0; background: #f5f5f7; }
              .container { text-align: center; padding: 2rem; background: white;
                          border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              h2 { color: #d32f2f; margin: 0 0 1rem 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>✗ Authentication Failed</h2>
              <p>Returning to app...</p>
            </div>
          </body>
        </html>
      `);
    }

    const token = generateToken(req.user._id);
    console.log('🍎 [APPLE_SUCCESS] Token generated:', token.substring(0, 20) + '...');

    // Return simple HTML without window.close() - let the sign_in_with_apple package handle the tab lifecycle
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Sign in with Apple</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                   display: flex; justify-content: center; align-items: center;
                   min-height: 100vh; margin: 0; background: #f5f5f7; }
            .container { text-align: center; padding: 2rem; background: white;
                        border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h2 { color: #4caf50; margin: 0 0 1rem 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>✓ Authentication Successful!</h2>
            <p>Returning to app...</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("🍎 [APPLE_SUCCESS] Error:", error);
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Sign in with Apple</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                   display: flex; justify-content: center; align-items: center;
                   min-height: 100vh; margin: 0; background: #f5f5f7; }
            .container { text-align: center; padding: 2rem; background: white;
                        border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h2 { color: #ff9800; margin: 0 0 1rem 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>⚠ Authentication Error</h2>
            <p>Returning to app...</p>
          </div>
        </body>
      </html>
    `);
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
        picture: user.avatar,
        googleId: user.googleId,
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

// Update User Profile (name and avatar)
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name } = req.body;
    const updateData = {};

    // Update name if provided
    if (name && name.trim()) {
      updateData.name = name.trim();
    }

    // Update avatar if file uploaded
    if (req.file) {
      updateData.avatar = req.file.path; // Cloudinary URL
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No data to update",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        picture: updatedUser.avatar,
        googleId: updatedUser.googleId,
        authMethods: updatedUser.authMethods,
        isEmailVerified: updatedUser.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

// Change Password (for authenticated users)
const changePassword = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    // Find user with password field
    const user = await User.findById(userId).select("+password +authMethods");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user has email auth method (password login)
    if (!user.authMethods.includes("email")) {
      return res.status(400).json({
        success: false,
        message: "Password change not available for your account type. Please set up a password first.",
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Check if new password is same as current
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    // Update password (will be hashed via pre-save hook)
    user.password = newPassword;
    await user.save();

    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to change password",
      error: error.message,
    });
  }
};

// Forgot Password - Generate and send temporary password
const forgotPasswordWithTemp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Find user
    const user = await User.findOne({ email }).select("+authMethods");

    if (!user) {
      // Don't reveal if user exists for security
      return res.json({
        success: true,
        message: "If an account exists with this email, a temporary password has been sent",
      });
    }

    // Check if user has email/password auth method
    if (!user.authMethods.includes("email")) {
      return res.status(400).json({
        success: false,
        message: "This account uses social login (Google/Apple). Please login using that method.",
      });
    }

    // Generate random 6-digit password
    const tempPassword = Math.floor(100000 + Math.random() * 900000).toString();

    // Update user's password (will be hashed by pre-save hook)
    user.password = tempPassword;
    await user.save();

    // Send temporary password via email
    await sendTempPasswordEmail(email, tempPassword, user.name);

    console.log(`✅ Temporary password sent to ${email}: ${tempPassword}`); // For development/testing

    return res.json({
      success: true,
      message: "If an account exists with this email, a temporary password has been sent",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process forgot password request",
      error: error.message,
    });
  }
};

module.exports = {
  register,
  verifyOtp,
  resendOtp,
  login,
  forgotPassword: handlePasswordSetup, // Reused for Google/Apple users
  forgotPasswordWithTemp, // New forgot password with temporary password
  resetPassword,
  getMe,
  googleSuccess,
  appleSuccess,
  updateProfile,
  changePassword,
};
