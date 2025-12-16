const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const passport = require("passport")
const session = require("express-session");

// Import your configurations
const connectDB = require('./config/db');
const { cloudinary, storage } = require('./config/cloudinary');

const app = express();
const PORT = process.env.PORT || 5000;

// Simplified and more reliable CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Define allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8081',
      'http://localhost:19006',
      'http://192.168.1.1:8081', // Add your local IP if needed
      'https://diaryfitbackend.onrender.com',
      'https://diaryfibackend.onrender.com',
      'exp://localhost:19000', // Expo development
      'exp://192.168.1.1:19000', // Expo with local IP
      'https://appleid.apple.com', // Apple Sign-In
    ];
    
    // Allow any localhost with different ports (for development)
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list or allow all in development
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      console.log('Origin not allowed by CORS:', origin);
      callback(null, true); // Allow all origins in development
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin', 
    'X-Requested-With', 
    'Content-Type', 
    'Accept', 
    'Authorization',
    'Cache-Control',
    'Pragma',
    'X-CSRF-Token'
  ],
  exposedHeaders: ['set-cookie'],
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware FIRST
app.use(cors(corsOptions));

// Additional manual CORS headers (simplified to avoid conflicts)
app.use((req, res, next) => {
  // Handle preflight requests first
  if (req.method === 'OPTIONS') {
    console.log('Handling preflight request from:', req.headers.origin);
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
    return res.status(200).end();
  }
  
  // Ensure CORS headers are set for all responses
  if (req.headers.origin) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  
  next();
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware with updated configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production' ? true : false,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: false, // Set to false for frontend access if needed
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    },
  }),
);

// Connect to MongoDB
connectDB();

// Test route to check CORS
app.get('/api/test-cors', (req, res) => {
  console.log('CORS test route hit from origin:', req.headers.origin);
  res.json({
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Passport middleware
app.use(passport.initialize())
app.use(passport.session())

// Passport config
require("./config/passport")(passport)


// Routes
app.use("/api/auth", require("./routes/auth.route.js"));
app.use("/api/entries", require("./routes/entry.route.js"));

// Apple Sign-In callback route for mobile (used by sign_in_with_apple package on Android)
// The sign_in_with_apple package needs to intercept the raw callback data
// So we DON'T use passport here - just return a simple success page
app.get("/callbacks/sign_in_with_apple", (req, res) => {
  console.log('🍎 [CALLBACK GET] Apple callback received');
  console.log('🍎 [CALLBACK GET] Query:', JSON.stringify(req.query, null, 2));

  // Return HTML that the sign_in_with_apple package can parse
  // The package looks for this specific format to extract the authentication data
  res.send(`
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
          .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #4caf50;
                     border-radius: 50%; width: 40px; height: 40px;
                     animation: spin 1s linear infinite; margin: 1rem auto; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
        <script>
          // The sign_in_with_apple package will intercept and read the URL parameters
          // Then automatically close this WebView and return to the Flutter app
          console.log('Apple Sign In callback page loaded');
          console.log('Current URL:', window.location.href);

          // Notify that authentication is complete
          // The package should automatically detect this page and close the WebView
          window.onload = function() {
            console.log('Page loaded, package should now process the callback');
            // Give the package time to intercept, then show a close message
            setTimeout(function() {
              document.getElementById('status').innerHTML =
                'If this window does not close automatically, you can close it manually.';
            }, 3000);
          };
        </script>
      </head>
      <body>
        <div class="container">
          <h2>✓ Authentication Successful!</h2>
          <div class="spinner"></div>
          <p id="status">Returning to app...</p>
        </div>
      </body>
    </html>
  `);
});

app.post("/callbacks/sign_in_with_apple", (req, res) => {
  console.log('🍎 [CALLBACK POST] Apple callback received');
  console.log('🍎 [CALLBACK POST] Body:', JSON.stringify(req.body, null, 2));
  console.log('🍎 [CALLBACK POST] Query:', JSON.stringify(req.query, null, 2));

  const { code, id_token, state } = req.body;

  // Build the redirect URL with query params
  const params = new URLSearchParams({
    ...(code && { code }),
    ...(id_token && { id_token }),
    ...(state && { state })
  });

  const redirectUrl = `/callbacks/sign_in_with_apple?${params.toString()}`;
  console.log('🍎 [CALLBACK POST] Preparing redirect to:', redirectUrl);

  // Return HTML with JavaScript redirect instead of HTTP redirect
  // This keeps the page in the WebView context so the package can intercept
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Sign in with Apple</title>
      </head>
      <body>
        <script>
          // Immediately redirect to GET endpoint with params in URL
          window.location.href = '${redirectUrl}';
        </script>
        <p>Redirecting...</p>
      </body>
    </html>
  `);
});

// Basic routes
app.get('/', (req, res) => {
  res.json({
    message: 'Server is running!',
    status: 'success',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global Error Handler - Error:', err);
  console.error('Global Error Handler - Stack:', err.stack);
  console.error('Global Error Handler - Message:', err.message);

  // Ensure CORS headers are present even in error responses
  if (req.headers.origin) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.status(500).json({
    message: err.message || 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? { message: err.message } : err.stack
  });
});


// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️ Received SIGINT. Graceful shutdown...');

  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Ready for React Native connections`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 CORS: Allow all origins`);
});

module.exports = app;