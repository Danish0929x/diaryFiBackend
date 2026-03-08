const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
    },
    type: {
      type: String,
      enum: ['monthly', 'yearly'],
      required: true,
    },
    discount: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    maxUsage: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

const Coupon = mongoose.model('Coupon', couponSchema);
module.exports = Coupon;
