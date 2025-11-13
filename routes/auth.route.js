const express = require("express");
const passport = require("passport");
const { body } = require("express-validator");
const authController = require("../controllers/auth.controller");
const auth = require("../middleware/auth");
const userModel = require("../models/user.model");

const router = express.Router();

// Validation rules
const registerValidation = [
  body("name")
    .trim()
    .isLength({ min: 2 })
    .withMessage("Name must be at least 2 characters"),
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
];

const loginValidation = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),
  body("password").notEmpty().withMessage("Password is required"),
];

const forgotPasswordValidation = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email"),
];

const resetPasswordValidation = [
  body("token").notEmpty().withMessage("Reset token is required"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
];

// Authentication routes
router.post("/register", registerValidation, authController.register);
router.post("/verify-otp", authController.verifyOtp);
router.post("/resend-otp", authController.resendOtp);
router.post("/login", loginValidation, authController.login);
router.post(
  "/forgot-password",
  forgotPasswordValidation,
  authController.forgotPassword
);
router.post(
  "/reset-password",
  resetPasswordValidation,
  authController.resetPassword
);
router.get("/me", auth, authController.getMe);

// Google OAuth routes
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.CLIENT_URL}/login?error=google_auth_failed`,
    session: false,
  }),
  authController.googleSuccess
);

router.post("/google", async (req, res) => {
  try {
    console.log("=== Google Token Verification Route ===");
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "ID token is required",
      });
    }

    console.log("Received ID Token:", idToken.substring(0, 50) + "...");

    // Verify the token with Google
    const { OAuth2Client } = require("google-auth-library");
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
            ...(picture && !user?.avatar ? { avatar: picture } : {}),
          },
          $addToSet: { authMethods: "google" },
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
          lastLogin: new Date(),
        });
      }
    }

    // Generate JWT token
    const jwt = require("jsonwebtoken");
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Update last login
    await userModel.findByIdAndUpdate(user._id, {
      lastLogin: new Date(),
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authMethods: user.authMethods,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("❌ Google token verification error:", error);
    res.status(400).json({
      success: false,
      message: "Google authentication failed",
      error: error.message,
    });
  }
});

// Handle Google Access Token (for web OAuth flow)
router.post("/google-access-token", async (req, res) => {
  try {
    console.log("=== Google Access Token Verification Route ===");
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: "Access token is required",
      });
    }

    console.log("Received Access Token:", accessToken.substring(0, 50) + "...");

    // Verify the access token with Google's tokeninfo endpoint
    let tokenInfoResponse;
    try {
      // Try using built-in fetch (Node 18+) first
      tokenInfoResponse = await fetch(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
      );
    } catch (err) {
      // Fallback to node-fetch if available
      try {
        const nodeFetch = require("node-fetch");
        tokenInfoResponse = await nodeFetch(
          `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
        );
      } catch (fetchErr) {
        throw new Error("Unable to verify token: " + err.message);
      }
    }

    if (!tokenInfoResponse.ok) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired access token",
      });
    }

    const tokenInfo = await tokenInfoResponse.json();
    console.log("Token info:", tokenInfo);

    if (!tokenInfo.user_id || !tokenInfo.email) {
      return res.status(401).json({
        success: false,
        message: "Invalid token info",
      });
    }

    const googleId = tokenInfo.user_id;
    const email = tokenInfo.email;

    // Get additional user info from Google's userinfo endpoint
    let userinfoResponse;
    try {
      userinfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
    } catch (err) {
      try {
        const nodeFetch = require("node-fetch");
        userinfoResponse = await nodeFetch(
          "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
      } catch (fetchErr) {
        console.warn("Could not fetch userinfo:", fetchErr.message);
      }
    }

    let userinfo = { name: "", picture: "" };
    if (userinfoResponse && userinfoResponse.ok) {
      userinfo = await userinfoResponse.json();
    }

    const { name = "", picture = "" } = userinfo;

    // Find or create user
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
            ...(picture && { avatar: picture }),
          },
          $addToSet: { authMethods: "google" },
        },
        { new: true }
      );

      if (!user) {
        // Create new user
        console.log("Creating new Google user from access token");
        user = await userModel.create({
          googleId,
          name: name || email.split("@")[0],
          email,
          avatar: picture || "",
          authMethods: ["google"],
          isEmailVerified: true,
          lastLogin: new Date(),
        });
      }
    }

    // Generate JWT token
    const jwt = require("jsonwebtoken");
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    console.log("✅ Access token authentication successful");
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authMethods: user.authMethods,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("❌ Google access token verification error:", error);
    res.status(500).json({
      success: false,
      message: "Google authentication failed",
      error: error.message,
    });
  }
});

// Handle Apple ID Token (for mobile/web OAuth flow)
router.post("/apple", async (req, res) => {
  try {
    console.log("=== Apple ID Token Verification Route ===");
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "ID token is required",
      });
    }

    console.log("Received Apple ID Token:", idToken.substring(0, 50) + "...");

    // Decode the ID token to get user info
    const jwt = require("jsonwebtoken");

    // Decode the token with complete header and payload
    const decoded = jwt.decode(idToken, { complete: true });

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Invalid ID token format",
      });
    }

    console.log("Token header:", decoded.header);
    console.log("Token payload keys:", Object.keys(decoded.payload));

    const payload = decoded.payload;
    const appleId = payload.sub;
    const email = payload.email || "";
    const name = payload.name || "";
    const issuer = payload.iss;
    const audience = payload.aud;

    // Validate token claims
    if (!appleId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token: missing sub claim",
      });
    }

    // Validate issuer should be Apple (warning only, don't reject)
    if (issuer !== "https://appleid.apple.com") {
      console.warn("⚠️ Token issuer may not be Apple:", issuer);
    }

    // Validate audience matches our client ID (warning only for now)
    if (audience && audience !== process.env.APPLE_CLIENT_ID) {
      console.warn(
        "⚠️ Audience mismatch. Expected:",
        process.env.APPLE_CLIENT_ID,
        "Got:",
        audience
      );
    }

    // Find or create user
    let user = await userModel.findOneAndUpdate(
      { appleId },
      { $set: { lastLogin: new Date() } },
      { new: true }
    );

    if (user) {
      console.log("Existing Apple user found");
    } else {
      // Check if user exists with this email
      if (email) {
        user = await userModel.findOneAndUpdate(
          { email },
          {
            $set: {
              appleId,
              lastLogin: new Date(),
              isEmailVerified: true,
            },
            $addToSet: { authMethods: "apple" },
          },
          { new: true }
        );
      }

      if (!user) {
        // Create new user
        console.log("Creating new Apple user from ID token");
        user = await userModel.create({
          appleId,
          name: name || email.split("@")[0] || "Apple User",
          email: email || `apple_${appleId}@example.com`,
          authMethods: ["apple"],
          isEmailVerified: !!email,
          lastLogin: new Date(),
        });
      }
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    console.log("✅ Apple authentication successful");
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        authMethods: user.authMethods,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("❌ Apple authentication error:", error);
    res.status(500).json({
      success: false,
      message: "Apple authentication failed",
      error: error.message,
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
    session: false,
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
    session: false,
  }),
  authController.appleSuccess
);

// Special endpoint for mobile app Apple Sign-In callback (used by sign_in_with_apple package)
router.post("/apple/callback/mobile", async (req, res) => {
  try {
    console.log("=== Apple Mobile Callback ===");
    console.log("Body:", req.body);

    const { code, id_token, state } = req.body;

    if (!id_token && !code) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Sign in with Apple</title>
            <script>
              window.close();
            </script>
          </head>
          <body>
            <p>Authentication failed. You can close this window.</p>
          </body>
        </html>
      `);
    }

    // Return success page that will be picked up by the app
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sign in with Apple</title>
          <script>
            // This will be intercepted by the sign_in_with_apple package
            window.close();
          </script>
        </head>
        <body>
          <p>Authentication successful! You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Apple mobile callback error:", error);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Sign in with Apple</title>
          <script>
            window.close();
          </script>
        </head>
        <body>
          <p>Authentication error. You can close this window.</p>
        </body>
      </html>
    `);
  }
});

// Add error handling middleware for OAuth routes
router.use((error, req, res, next) => {
  console.error("OAuth Error:", error);

  if (req.originalUrl.includes("/auth/apple")) {
    return res.redirect(
      `${
        process.env.CLIENT_URL
      }/login?error=apple_oauth_error&details=${encodeURIComponent(
        error.message
      )}`
    );
  }

  if (req.originalUrl.includes("/auth/google")) {
    return res.redirect(
      `${
        process.env.CLIENT_URL
      }/login?error=google_oauth_error&details=${encodeURIComponent(
        error.message
      )}`
    );
  }

  next(error);
});

module.exports = router;
