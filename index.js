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
      'exp://localhost:19000', // Expo development
      'exp://192.168.1.1:19000', // Expo with local IP
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
  console.error('Error:', err.stack);
  
  // Ensure CORS headers are present even in error responses
  if (req.headers.origin) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? {} : err.message
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