const GoogleStrategy = require("passport-google-oauth20").Strategy;
const AppleStrategy = require("passport-apple").Strategy;
const jwt = require('jsonwebtoken');
const User = require("../models/User");

module.exports = (passport) => {
  // Google Strategy (existing - keep as is)
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        passReqToCallback: true
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOneAndUpdate(
            { googleId: profile.id },
            { $set: { lastLogin: new Date() } },
            { new: true }
          );

          if (user) return done(null, user);

          const email = profile.emails[0].value;
          user = await User.findOneAndUpdate(
            { email },
            {
              $set: {
                googleId: profile.id,
                lastLogin: new Date(),
                ...(!req.user?.avatar && profile.photos?.[0]?.value 
                  ? { avatar: profile.photos[0].value } 
                  : {})
              },
              $addToSet: { authMethods: "google" }
            },
            { new: true }
          );

          if (user) {
            if (!user.isEmailVerified) {
              await User.findByIdAndUpdate(user._id, {
                $set: { isEmailVerified: true }
              });
            }
            return done(null, user);
          }

          user = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email,
            avatar: profile.photos?.[0]?.value || "",
            authMethods: ["google"],
            isEmailVerified: true,
            lastLogin: new Date()
          });

          return done(null, user);
        } catch (error) {
          console.error("Google OAuth error:", error);
          return done(error, null);
        }
      }
    )
  );

  // Fixed Apple Strategy
  passport.use(
    new AppleStrategy(
      {
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        keyID: process.env.APPLE_KEY_ID,
        privateKeyString: process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        callbackURL: process.env.APPLE_CALLBACK_URL,
        scope: ["name", "email"],
        passReqToCallback: true
      },
      async (req, accessToken, refreshToken, idToken, profile, done) => {
        try {
          console.log("=== Apple OAuth Debug ===");
          console.log("Profile:", JSON.stringify(profile, null, 2));
          console.log("ID Token (raw):", idToken);
          console.log("Request body:", JSON.stringify(req.body, null, 2));
          
          // Properly decode the Apple ID Token
          let decodedToken;
          try {
            // Apple ID tokens are JWTs - decode without verification for data extraction
            decodedToken = jwt.decode(idToken);
            console.log("Decoded ID Token:", JSON.stringify(decodedToken, null, 2));
          } catch (decodeError) {
            console.error("Failed to decode Apple ID token:", decodeError);
            return done(new Error("Invalid Apple ID token"), null);
          }

          // Extract data from multiple sources
          let email, appleId, name;
          
          // 1. Get Apple ID (subject) - this should always be present
          appleId = decodedToken?.sub;
          if (!appleId) {
            console.error("No Apple ID (sub) found in decoded token");
            return done(new Error("Apple ID not found in token"), null);
          }
          
          // 2. Get email - check multiple sources
          email = decodedToken?.email || profile?.email;
          
          // 3. Get name - Apple only sends this on FIRST authorization
          // Check request body for user data (first-time only)
          if (req.body?.user) {
            try {
              const userData = typeof req.body.user === 'string' 
                ? JSON.parse(req.body.user) 
                : req.body.user;
              
              console.log("Parsed Apple user data:", userData);
              
              if (userData.name) {
                const firstName = userData.name.firstName || '';
                const lastName = userData.name.lastName || '';
                name = `${firstName} ${lastName}`.trim();
              }
              
              // Email might also be here
              email = email || userData.email;
            } catch (parseError) {
              console.log("Error parsing Apple user data:", parseError);
            }
          }
          
          // Fallbacks for missing data
          if (!email) {
            console.warn("No email provided by Apple - this should not happen if email scope was requested");
            // Apple should provide email if requested in scope
            email = `apple_${appleId}@privaterelay.appleid.com`;
          }
          
          if (!name) {
            // Try to get name from existing user or use fallback
            const existingUser = await User.findOne({ appleId });
            name = existingUser?.name || email.split('@')[0] || 'Apple User';
          }

          console.log(`Final extracted data - ID: ${appleId}, Email: ${email}, Name: ${name}`);

          // 1. Check for existing Apple user
          let user = await User.findOneAndUpdate(
            { appleId: appleId },
            { $set: { lastLogin: new Date() } },
            { new: true }
          ).select('+authMethods');

          if (user) {
            console.log("Found existing Apple user:", user._id);
            return done(null, user);
          }

          // 2. Check for existing email user (link accounts)
          if (email && !email.includes('apple_')) {
            user = await User.findOneAndUpdate(
              { email },
              {
                $set: {
                  appleId: appleId,
                  lastLogin: new Date(),
                  isEmailVerified: true // Apple emails are verified
                },
                $addToSet: { authMethods: "apple" }
              },
              { new: true }
            ).select('+authMethods');

            if (user) {
              console.log("Linked Apple to existing email user:", user._id);
              return done(null, user);
            }
          }

          // 3. Create new Apple user
          console.log("Creating new Apple user");
          user = await User.create({
            appleId: appleId,
            name: name,
            email: email,
            authMethods: ["apple"],
            isEmailVerified: true,
            lastLogin: new Date()
          });

          console.log("Apple user created successfully:", user._id);
          return done(null, user);

        } catch (error) {
          console.error("Apple OAuth detailed error:", error);
          return done(error, null);
        }
      }
    )
  );

  // Session serialization
  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};