const Entry = require("../models/entry.model");
const { deleteFromCloudinary } = require("../middleware/upload");

// Create a new entry
const createEntry = async (req, res) => {
  try {
    const { title, description, location, createdAt, formatSpans, journal } = req.body;
    const userId = req.user.userId; // From auth middleware

    // Validate required fields
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    // Parse location if provided as string
    let parsedLocation = null;
    if (location) {
      try {
        parsedLocation = typeof location === "string" ? JSON.parse(location) : location;
      } catch (e) {
        console.error("Error parsing location:", e);
      }
    }

    // Parse formatSpans if provided as string
    let parsedFormatSpans = null;
    if (formatSpans) {
      try {
        parsedFormatSpans = typeof formatSpans === "string" ? JSON.parse(formatSpans) : formatSpans;
        console.log("📝 [Backend] Parsed formatSpans:", parsedFormatSpans);
      } catch (e) {
        console.error("Error parsing formatSpans:", e);
      }
    }

    // Create entry with uploaded media
    const entryData = {
      user: userId,
      title,
      description,
      media: req.uploadedMedia || [],
      location: parsedLocation || {
        type: "Point",
        coordinates: [0, 0],
        address: "",
      },
      formatSpans: parsedFormatSpans || [],
    };

    // Add journal if provided
    if (journal) {
      entryData.journal = journal;
    }

    // Add custom createdAt if provided
    if (createdAt) {
      entryData.createdAt = new Date(createdAt);
    }

    const entry = await Entry.create(entryData);

    // Populate user details
    await entry.populate("user", "name email avatar");

    return res.status(201).json({
      success: true,
      message: "Entry created successfully",
      entry,
    });
  } catch (error) {
    console.error("Create entry error:", error);
    console.error("Error stack:", error.stack);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create entry",
      error: process.env.NODE_ENV === "development" ? error.stack : {},
    });
  }
};

// Get all entries for the authenticated user
const getUserEntries = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10, sort = "-createdAt", journal } = req.query;

    // Build query filter
    const filter = { user: userId };

    // If journal parameter is provided and not 'all', filter by journal
    if (journal && journal !== 'all') {
      filter.journal = journal;
    }

    const entries = await Entry.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("user", "name email avatar")
      .populate("journal", "name color")
      .exec();

    const count = await Entry.countDocuments(filter);

    return res.json({
      success: true,
      entries,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalEntries: count,
    });
  } catch (error) {
    console.error("Get user entries error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch entries",
    });
  }
};

// Get a single entry by ID
const getEntryById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const entry = await Entry.findOne({ _id: id, user: userId }).populate(
      "user",
      "name email avatar"
    );

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Entry not found",
      });
    }

    return res.json({
      success: true,
      entry,
    });
  } catch (error) {
    console.error("Get entry error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch entry",
    });
  }
};

// Update an entry
const updateEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { title, description, location, formatSpans } = req.body;

    const entry = await Entry.findOne({ _id: id, user: userId });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Entry not found",
      });
    }

    // Update fields if provided
    if (title) entry.title = title;
    if (description) entry.description = description;

    // Parse and update location if provided
    if (location) {
      try {
        const parsedLocation = typeof location === "string" ? JSON.parse(location) : location;
        entry.location = parsedLocation;
      } catch (e) {
        console.error("Error parsing location:", e);
      }
    }

    // Parse and update formatSpans if provided
    if (formatSpans !== undefined) {
      try {
        const parsedFormatSpans = typeof formatSpans === "string" ? JSON.parse(formatSpans) : formatSpans;
        entry.formatSpans = parsedFormatSpans;
        console.log("📝 [Backend] Updated formatSpans:", parsedFormatSpans);
      } catch (e) {
        console.error("Error parsing formatSpans:", e);
      }
    }

    // Add new media if uploaded
    if (req.uploadedMedia && req.uploadedMedia.length > 0) {
      entry.media.push(...req.uploadedMedia);
    }

    await entry.save();
    await entry.populate("user", "name email avatar");

    return res.json({
      success: true,
      message: "Entry updated successfully",
      entry,
    });
  } catch (error) {
    console.error("Update entry error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update entry",
    });
  }
};

// Delete an entry
const deleteEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const entry = await Entry.findOne({ _id: id, user: userId });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Entry not found",
      });
    }

    // Delete all associated media from Cloudinary
    if (entry.media && entry.media.length > 0) {
      const deletePromises = entry.media.map((media) =>
        deleteFromCloudinary(media.publicId).catch((err) => {
          console.error(`Failed to delete media ${media.publicId}:`, err);
        })
      );
      await Promise.all(deletePromises);
    }

    await Entry.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: "Entry deleted successfully",
    });
  } catch (error) {
    console.error("Delete entry error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete entry",
    });
  }
};

// Delete a specific media item from an entry
const deleteMediaFromEntry = async (req, res) => {
  try {
    const { id, mediaId } = req.params;
    const userId = req.user.userId;

    const entry = await Entry.findOne({ _id: id, user: userId });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Entry not found",
      });
    }

    const media = entry.media.id(mediaId);

    if (!media) {
      return res.status(404).json({
        success: false,
        message: "Media not found",
      });
    }

    // Delete from Cloudinary
    try {
      await deleteFromCloudinary(media.publicId);
    } catch (err) {
      console.error("Error deleting from Cloudinary:", err);
    }

    // Remove from entry
    entry.media.pull(mediaId);
    await entry.save();

    return res.json({
      success: true,
      message: "Media deleted successfully",
      entry,
    });
  } catch (error) {
    console.error("Delete media error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete media",
    });
  }
};

// Search entries by title or description
const searchEntries = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { query, page = 1, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const entries = await Entry.find({
      user: userId,
      $or: [
        { title: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
      ],
    })
      .sort("-createdAt")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("user", "name email avatar")
      .exec();

    const count = await Entry.countDocuments({
      user: userId,
      $or: [
        { title: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
      ],
    });

    return res.json({
      success: true,
      entries,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalEntries: count,
    });
  } catch (error) {
    console.error("Search entries error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to search entries",
    });
  }
};

// Get entries near a location
const getNearbyEntries = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { longitude, latitude, maxDistance = 10000 } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: "Longitude and latitude are required",
      });
    }

    const entries = await Entry.find({
      user: userId,
      "location.coordinates": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(longitude), parseFloat(latitude)],
          },
          $maxDistance: parseInt(maxDistance),
        },
      },
    })
      .populate("user", "name email avatar")
      .exec();

    return res.json({
      success: true,
      entries,
      totalEntries: entries.length,
    });
  } catch (error) {
    console.error("Get nearby entries error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch nearby entries",
    });
  }
};

// Get entry statistics
const getEntryStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    const totalEntries = await Entry.countDocuments({ user: userId });
    const totalMediaCount = await Entry.aggregate([
      { $match: { user: userId } },
      { $project: { mediaCount: { $size: "$media" } } },
      { $group: { _id: null, total: { $sum: "$mediaCount" } } },
    ]);

    const entriesByMonth = await Entry.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
    ]);

    return res.json({
      success: true,
      stats: {
        totalEntries,
        totalMedia: totalMediaCount[0]?.total || 0,
        entriesByMonth,
      },
    });
  } catch (error) {
    console.error("Get entry stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch entry statistics",
    });
  }
};

module.exports = {
  createEntry,
  getUserEntries,
  getEntryById,
  updateEntry,
  deleteEntry,
  deleteMediaFromEntry,
  searchEntries,
  getNearbyEntries,
  getEntryStats,
};
