const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      unique: true
    },
    password: {
       type: String,
      minlength: 6
    },
    googleId: {
      type: String,
      sparse: true, 
    },
    appleId: {
      type: String,
      sparse: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    authMethods: {
      type: [String],
      enum: ["email", "google", "apple"],
      required: true,
      default: ["email"]
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
    // OTP fields
    emailOtp: {
      type: String,
      select: false,
    },
    emailOtpExpires: {
      type: Date,
      select: false,
    },
    otpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true
  }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  // Only hash if password is modified or new
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Auto-verify Google-authenticated users
userSchema.pre("save", function (next) {
  if (this.authMethods.includes("google")) {
    this.isEmailVerified = true;
  }
  next();
});

// Password comparison method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};


// Generate email verification token
userSchema.methods.createVerificationToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  this.emailVerificationToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// Generate 4-digit OTP
userSchema.methods.createEmailOtp = function () {
  const otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
  this.emailOtp = otp;
  this.emailOtpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  this.otpAttempts = 0;
  return otp;
};

// Verify OTP
userSchema.methods.verifyOtp = function (otp) {
  if (!this.emailOtp || !this.emailOtpExpires) {
    return { success: false, message: "No OTP found. Please request a new one." };
  }

  if (Date.now() > this.emailOtpExpires) {
    return { success: false, message: "OTP has expired. Please request a new one." };
  }

  if (this.otpAttempts >= 5) {
    return { success: false, message: "Too many failed attempts. Please request a new OTP." };
  }

  if (this.emailOtp !== otp) {
    this.otpAttempts += 1;
    return { success: false, message: `Invalid OTP. ${5 - this.otpAttempts} attempts remaining.` };
  }

  return { success: true, message: "OTP verified successfully" };
};

// Generate password reset token
userSchema.methods.createPasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  return token;
};

// Add authentication method (atomic update)
userSchema.methods.addAuthMethod = function (method) {
  return this.updateOne({
    $addToSet: { authMethods: method }
  });
};

module.exports = mongoose.model("User", userSchema);