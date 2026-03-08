const User = require('../models/user.model');
const Coupon = require('../models/coupon.model');

/**
 * Verify purchase and grant premium access
 *
 * For production:
 * - Implement Google Play Developer API verification for Android
 * - Implement App Store Server API verification for iOS
 *
 * For now, this is a simplified version for testing
 */
const verifyPurchase = async (req, res) => {
  try {
    const { productId, purchaseToken, platform, transactionId, couponCode } = req.body;
    const userId = req.user.userId;
    let appliedCoupon = null;

    console.log('🔐 Purchase Verification Request:');
    console.log(`  User ID: ${userId}`);
    console.log(`  Product ID: ${productId}`);
    console.log(`  Platform: ${platform}`);
    console.log(`  Transaction ID: ${transactionId}`);

    // Validate input
    if (!productId || !purchaseToken || !platform) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: productId, purchaseToken, platform',
      });
    }

    // Verify product ID is valid
    const validProducts = [
      'com.journal.diaryfi.monthly',
      'com.journal.diaryfi.yearly'
    ];
    if (!validProducts.includes(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID',
      });
    }

    // Validate coupon if provided
    if (couponCode) {
      try {
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

        if (!coupon) {
          return res.status(400).json({
            success: false,
            message: 'Invalid coupon code',
          });
        }

        // Check if coupon is active
        if (!coupon.isActive) {
          return res.status(400).json({
            success: false,
            message: 'This coupon is inactive',
          });
        }

        // Check if coupon has expired
        if (new Date() > new Date(coupon.expiresAt)) {
          return res.status(400).json({
            success: false,
            message: 'This coupon has expired',
          });
        }

        // Check if coupon type matches subscription type
        const subscriptionType = productId.includes('monthly') ? 'monthly' : 'yearly';
        if (coupon.type !== subscriptionType) {
          return res.status(400).json({
            success: false,
            message: `This coupon is only valid for ${coupon.type} subscriptions`,
          });
        }

        // Check max usage limit
        if (coupon.maxUsage && coupon.usageCount >= coupon.maxUsage) {
          return res.status(400).json({
            success: false,
            message: 'This coupon has reached its usage limit',
          });
        }

        appliedCoupon = {
          code: coupon.code,
          type: coupon.type,
        };

        console.log(`✅ Coupon validated: ${coupon.code}`);
      } catch (couponError) {
        console.error('❌ Coupon validation error:', couponError);
        return res.status(500).json({
          success: false,
          message: 'Error validating coupon',
        });
      }
    }

    // TODO: In production, verify with Google Play/App Store
    // For now, we'll trust the client and grant premium access

    let isValid = false;

    if (platform === 'android') {
      // TODO: Verify with Google Play Developer API
      // const isValid = await verifyAndroidPurchase(productId, purchaseToken);

      // For testing, accept all purchases
      console.log('⚠️  Android verification not implemented - granting premium for testing');
      isValid = true;
    } else if (platform === 'ios') {
      // TODO: Verify with App Store Server API
      // const isValid = await verifyIOSPurchase(purchaseToken);

      // For testing, accept all purchases
      console.log('⚠️  iOS verification not implemented - granting premium for testing');
      isValid = true;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid platform. Must be "android" or "ios"',
      });
    }

    if (isValid) {
      // Increment coupon usage if one was applied
      if (appliedCoupon) {
        await Coupon.findOneAndUpdate(
          { code: appliedCoupon.code },
          { $inc: { usageCount: 1 } }
        );
        console.log(`📊 Coupon usage incremented: ${appliedCoupon.code}`);
      }

      // Update user to premium
      const user = await User.findByIdAndUpdate(
        userId,
        {
          isPremium: true,
          // Optionally store purchase details
          // purchaseInfo: {
          //   productId,
          //   platform,
          //   transactionId,
          //   purchaseDate: new Date(),
          //   couponUsed: appliedCoupon?.code,
          // }
        },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      console.log('✅ Purchase verified - User upgraded to premium');

      const response = {
        success: true,
        message: 'Purchase verified successfully',
        user: {
          id: user._id,
          name: user.username,
          email: user.email,
          picture: user.avatar,
          googleId: user.googleId,
          authMethods: user.authMethods,
          isEmailVerified: user.isEmailVerified,
          isPremium: user.isPremium,
        },
      };

      // Include coupon info in response if one was used
      if (appliedCoupon) {
        response.appliedCoupon = appliedCoupon;
      }

      return res.json(response);
    } else {
      console.log('❌ Purchase verification failed');
      return res.status(400).json({
        success: false,
        message: 'Purchase verification failed',
      });
    }
  } catch (error) {
    console.error('❌ Purchase verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during purchase verification',
      error: error.message,
    });
  }
};

/**
 * For production: Implement Google Play verification
 *
 * const { google } = require('googleapis');
 *
 * const verifyAndroidPurchase = async (productId, purchaseToken) => {
 *   try {
 *     const androidPublisher = google.androidpublisher({
 *       version: 'v3',
 *       auth: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY
 *     });
 *
 *     const response = await androidPublisher.purchases.subscriptions.get({
 *       packageName: 'com.griffonwebstudios.diaryfi',
 *       subscriptionId: productId,
 *       token: purchaseToken,
 *     });
 *
 *     return response.data.paymentState === 1;
 *   } catch (error) {
 *     console.error('Android verification error:', error);
 *     return false;
 *   }
 * };
 */

/**
 * For production: Implement iOS verification
 *
 * const verifyIOSPurchase = async (receiptData) => {
 *   // Use App Store Server API or libraries like 'node-iap'
 *   // See: https://developer.apple.com/documentation/appstoreserverapi
 * };
 */

/**
 * Apply coupon directly (grant premium without IAP)
 */
const applyCoupon = async (req, res) => {
  try {
    const { couponCode, subscriptionType } = req.body;
    const userId = req.user.userId;

    console.log("💰 Applying coupon directly:");
    console.log(`  User ID: ${userId}`);
    console.log(`  Coupon Code: ${couponCode}`);
    console.log(`  Subscription Type: ${subscriptionType}`);

    // Validate input
    if (!couponCode || !subscriptionType) {
      return res.status(400).json({
        success: false,
        message: "Coupon code and subscription type are required",
      });
    }

    // Find coupon
    const Coupon = require("../models/coupon.model");
    const User = require("../models/user.model");

    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon code",
      });
    }

    // Check if coupon is active
    if (!coupon.isActive) {
      return res.status(400).json({
        success: false,
        message: "This coupon is inactive",
      });
    }

    // Check if coupon has expired
    if (new Date() > new Date(coupon.expiresAt)) {
      return res.status(400).json({
        success: false,
        message: "This coupon has expired",
      });
    }

    // Check if coupon type matches subscription type
    if (coupon.type !== subscriptionType) {
      return res.status(400).json({
        success: false,
        message: `This coupon is only valid for ${coupon.type} subscriptions`,
      });
    }

    // Check max usage limit
    if (coupon.maxUsage && coupon.usageCount >= coupon.maxUsage) {
      return res.status(400).json({
        success: false,
        message: "This coupon has reached its usage limit",
      });
    }

    // Increment coupon usage
    await Coupon.findByIdAndUpdate(coupon._id, {
      $inc: { usageCount: 1 },
    });

    // Update user to premium
    const user = await User.findByIdAndUpdate(userId, { isPremium: true }, { new: true });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log("✅ Coupon applied - User upgraded to premium");

    return res.json({
      success: true,
      message: "Coupon applied successfully",
      appliedCoupon: {
        code: coupon.code,
        type: coupon.type,
      },
      user: {
        id: user._id,
        name: user.username,
        email: user.email,
        picture: user.avatar,
        isPremium: user.isPremium,
      },
    });
  } catch (error) {
    console.error("❌ Apply coupon error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to apply coupon",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  verifyPurchase,
  applyCoupon,
};
