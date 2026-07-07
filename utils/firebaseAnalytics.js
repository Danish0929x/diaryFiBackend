const admin = require("firebase-admin");

// Get Firebase Realtime Analytics (from Firestore/Realtime DB)
const getFirebaseEvents = async (limit = 50) => {
  try {
    const User = require("../models/user.model");
    const Entry = require("../models/entry.model");

    // Get recently active users
    const recentUsers = await User.find()
      .sort({ updatedAt: -1 })
      .limit(limit)
      .select("username email avatar createdAt updatedAt");

    // Get recent entries with all activities
    const recentEntries = await Entry.find({ isDeleted: false })
      .populate("user", "username email")
      .sort({ updatedAt: -1 })
      .limit(limit * 2); // Get more to capture different event types

    // Generate activities from entries
    const activities = [];

    recentEntries.forEach((entry) => {
      const username = entry.user?.username || "Unknown";
      const email = entry.user?.email || "unknown@example.com";

      // Entry Created event
      activities.push({
        _id: `${entry._id}_created`,
        user: { username, email },
        type: "entry_created",
        timestamp: entry.createdAt,
        title: entry.title || "Untitled Entry",
      });

      // Entry Edited event (if updated after created)
      if (entry.updatedAt && entry.updatedAt > entry.createdAt) {
        activities.push({
          _id: `${entry._id}_edited`,
          user: { username, email },
          type: "entry_edited",
          timestamp: entry.updatedAt,
          title: entry.title || "Untitled Entry",
        });
      }

      // Image Added events
      if (entry.media && entry.media.length > 0) {
        entry.media.forEach((media) => {
          if (media.type === "image") {
            activities.push({
              _id: `${entry._id}_image_${media._id}`,
              user: { username, email },
              type: "image_added",
              timestamp: entry.updatedAt || entry.createdAt,
              title: entry.title || "Untitled Entry",
            });
          } else if (media.type === "video") {
            activities.push({
              _id: `${entry._id}_video_${media._id}`,
              user: { username, email },
              type: "video_added",
              timestamp: entry.updatedAt || entry.createdAt,
              title: entry.title || "Untitled Entry",
            });
          } else if (media.type === "audio") {
            activities.push({
              _id: `${entry._id}_audio_${media._id}`,
              user: { username, email },
              type: "audio_added",
              timestamp: entry.updatedAt || entry.createdAt,
              title: entry.title || "Untitled Entry",
            });
          }
        });
      }

      // Location Added event
      if (entry.location && entry.location.coordinates && entry.location.coordinates.length > 0) {
        activities.push({
          _id: `${entry._id}_location`,
          user: { username, email },
          type: "location_added",
          timestamp: entry.updatedAt || entry.createdAt,
          title: entry.title || "Untitled Entry",
        });
      }
    });

    // Sort by timestamp descending and limit
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limitedActivities = activities.slice(0, limit);

    return {
      activities: limitedActivities,
      totalUsers: recentUsers.length,
      totalEntries: await Entry.countDocuments({ isDeleted: false }),
    };
  } catch (error) {
    console.error("Firebase analytics error:", error);
    throw error;
  }
};

// Get user engagement metrics
const getUserEngagement = async () => {
  try {
    const User = require("../models/user.model");
    const Entry = require("../models/entry.model");

    const totalUsers = await User.countDocuments();
    const totalEntries = await Entry.countDocuments({ isDeleted: false });
    const activeUsersLast7Days = await User.countDocuments({
      updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    });
    const entriesLastMonth = await Entry.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      isDeleted: false,
    });

    return {
      totalUsers,
      totalEntries,
      activeUsersLast7Days,
      entriesLastMonth,
      engagementRate: totalUsers > 0 ? ((activeUsersLast7Days / totalUsers) * 100).toFixed(2) : 0,
    };
  } catch (error) {
    console.error("User engagement error:", error);
    throw error;
  }
};

// Get daily entry statistics
const getDailyStats = async (days = 30) => {
  try {
    const Entry = require("../models/entry.model");

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const dailyStats = await Entry.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return dailyStats;
  } catch (error) {
    console.error("Daily stats error:", error);
    throw error;
  }
};

// Get most active users with entry counts
const getMostActiveUsers = async (limit = 10) => {
  try {
    const User = require("../models/user.model");
    const Entry = require("../models/entry.model");

    const users = await User.aggregate([
      {
        $lookup: {
          from: "entries",
          localField: "_id",
          foreignField: "user",
          as: "entries",
        },
      },
      {
        $addFields: {
          entryCount: {
            $size: {
              $filter: {
                input: "$entries",
                as: "entry",
                cond: { $eq: ["$$entry.isDeleted", false] },
              },
            },
          },
          lastActivity: { $max: "$entries.updatedAt" },
        },
      },
      { $sort: { entryCount: -1 } },
      { $limit: limit },
      {
        $project: {
          userId: "$_id",
          username: 1,
          email: 1,
          avatar: 1,
          entryCount: 1,
          lastActivity: 1,
          _id: 0,
        },
      },
    ]);

    return users;
  } catch (error) {
    console.error("Most active users error:", error);
    throw error;
  }
};

// Get Firebase Events with pagination
const getFirebaseEventsWithPagination = async (limit = 15, offset = 0) => {
  try {
    const User = require("../models/user.model");
    const Entry = require("../models/entry.model");

    // Get recently active users
    const recentUsers = await User.find()
      .sort({ updatedAt: -1 })
      .limit(limit + offset)
      .select("username email avatar createdAt updatedAt");

    // Get recent entries with all activities
    const recentEntries = await Entry.find({ isDeleted: false })
      .populate("user", "username email")
      .sort({ updatedAt: -1 })
      .limit((limit + offset) * 2); // Get more to capture different event types

    // Generate activities from entries
    const allActivities = [];

    recentEntries.forEach((entry) => {
      const username = entry.user?.username || "Unknown";
      const email = entry.user?.email || "unknown@example.com";

      // Entry Created event
      allActivities.push({
        _id: `${entry._id}_created`,
        user: { username, email },
        type: "entry_created",
        timestamp: entry.createdAt,
        title: entry.title || "Untitled Entry",
      });

      // Entry Edited event (if updated after created)
      if (entry.updatedAt && entry.updatedAt > entry.createdAt) {
        allActivities.push({
          _id: `${entry._id}_edited`,
          user: { username, email },
          type: "entry_edited",
          timestamp: entry.updatedAt,
          title: entry.title || "Untitled Entry",
        });
      }

      // Media events
      if (entry.media && entry.media.length > 0) {
        entry.media.forEach((media) => {
          const mediaTypeMap = {
            image: "image_added",
            video: "video_added",
            audio: "audio_added",
          };

          if (mediaTypeMap[media.type]) {
            allActivities.push({
              _id: `${entry._id}_${media.type}_${media._id}`,
              user: { username, email },
              type: mediaTypeMap[media.type],
              timestamp: entry.updatedAt || entry.createdAt,
              title: entry.title || "Untitled Entry",
            });
          }
        });
      }

      // Location Added event
      if (entry.location && entry.location.coordinates && entry.location.coordinates.length > 0) {
        allActivities.push({
          _id: `${entry._id}_location`,
          user: { username, email },
          type: "location_added",
          timestamp: entry.updatedAt || entry.createdAt,
          title: entry.title || "Untitled Entry",
        });
      }
    });

    // Sort by timestamp descending
    allActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply pagination
    const paginatedActivities = allActivities.slice(offset, offset + limit);

    return {
      activities: paginatedActivities,
      totalUsers: recentUsers.length,
      totalEntries: await Entry.countDocuments({ isDeleted: false }),
      totalActivities: allActivities.length,
    };
  } catch (error) {
    console.error("Firebase analytics pagination error:", error);
    throw error;
  }
};

module.exports = {
  getFirebaseEvents,
  getFirebaseEventsWithPagination,
  getUserEngagement,
  getDailyStats,
  getMostActiveUsers,
};
