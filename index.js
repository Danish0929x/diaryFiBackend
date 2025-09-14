const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const session = require("express-session");

// Import your configurations
const connectDB = require('./config/db');
const { cloudinary, storage } = require('./config/cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Middleware for development (React Native compatibility)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*'); // Reflect origin
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Use true if HTTPS in production
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

// Connect to MongoDB
connectDB();

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
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? {} : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl
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
});
