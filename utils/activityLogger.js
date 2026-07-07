const Activity = require("../models/activity.model");

const logActivity = async (userId, activityType, description, metadata = {}) => {
  try {
    const activity = new Activity({
      user: userId,
      activityType,
      description,
      metadata,
    });
    await activity.save();
    return activity;
  } catch (error) {
    console.error("Activity logging error:", error);
    // Don't throw error - logging shouldn't break the main operation
  }
};

module.exports = { logActivity };
