const User = require('../models/user.model');

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
    const { productId, purchaseToken, platform, transactionId } = req.body;
    const userId = req.user.userId;

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
    const validProducts = ['premium_monthly', 'premium_yearly'];
    if (!validProducts.includes(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID',
      });
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

      return res.json({
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
      });
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

module.exports = {
  verifyPurchase,
};
