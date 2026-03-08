const express = require('express');
const router = express.Router();
const { verifyPurchase, applyCoupon } = require('../controllers/purchase.controller');
const auth = require('../middleware/auth');

// Verify purchase (requires authentication)
router.post('/verify', auth, verifyPurchase);

// Apply coupon directly (requires authentication)
router.post('/apply-coupon', auth, applyCoupon);

module.exports = router;
