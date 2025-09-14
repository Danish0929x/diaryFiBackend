const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
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