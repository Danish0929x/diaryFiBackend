const express = require('express');
const router = express.Router();
const { verifyPurchase } = require('../controllers/purchase.controller');
const auth = require('../middleware/auth');

// Verify purchase (requires authentication)
router.post('/verify', auth, verifyPurchase);

module.exports = router;
