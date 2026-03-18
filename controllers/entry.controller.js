const Entry = require("../models/entry.model");
const { deleteFromCloudinary } = require("../middleware/upload");
const { encryptEntryFields, decryptEntryFields, decryptEntries } = require("../utils/encryption");

// Create a new entry
const createEntry = async (req, res) => {
  try {
    const { title, description, location, createdAt, formatSpans, journal } = req.body;
    const userId = req.user.userId; // From auth middleware

    // Get user to check premium status
    const User = require("../models/user.model");
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check entry limit for free users (30 entries max)
    if (!user.isPremium) {
      const entryCount = await Entry.countDocuments({ user: userId });
      if (entryCount >= 30) {
        return res.status(403).json({
          success: false,
          message: "Free users can create maximum 30 entries. Upgrade to premium for unlimited entries.",
        });
      }
    }

    // Check media restrictions for free users
    if (!user.isPremium && req.uploadedMedia && req.uploadedMedia.length > 0) {
      // Check for video (not allowed for free users)
      const hasVideo = req.uploadedMedia.some(m =>
        m.type === 'video' ||
        /\.(mp4|mov|avi|mkv|webm)$/i.test(m.filename || '')
      );

      if (hasVideo) {
        return res.status(403).json({
          success: false,
          message: "Video uploads are only available for premium users. Upgrade to premium to attach videos.",
        });
      }

      // Check media count (max 3 for free users)
      if (req.uploadedMedia.length > 3) {
        return res.status(403).json({
          success: false,
          message: "Free users can attach up to 3 media files per entry. Upgrade to premium for unlimited media attachments.",
        });
      }
    }

    // Validate required fields - at least one of title, description, or media is required
    const hasMedia = req.uploadedMedia && req.uploadedMedia.length > 0;
    if (!title && !description && !hasMedia) {
      return res.status(400).json({
        success: false,
        message: "At least one of title, description, or media is required",
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
      isEncrypted: true,
    };

    // Encrypt text fields before saving to database
    encryptEntryFields(entryData);

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

    // Decrypt fields before sending response
    const decryptedEntry = decryptEntryFields(entry);

    return res.status(201).json({
      success: true,
      message: "Entry created successfully",
      entry: decryptedEntry,
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

    // Decrypt entries before sending response
    const decryptedEntries = decryptEntries(entries);

    return res.json({
      success: true,
      entries: decryptedEntries,
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

    // Decrypt fields before sending response
    const decryptedEntry = decryptEntryFields(entry);

    return res.json({
      success: true,
      entry: decryptedEntry,
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
    const { title, description, location, formatSpans, createdAt } = req.body;

    const entry = await Entry.findOne({ _id: id, user: userId });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Entry not found",
      });
    }

    // Get user to check premium status for media uploads
    const User = require("../models/user.model");
    const user = await User.findById(userId);

    // Check media restrictions for free users when adding new media
    if (!user.isPremium && req.uploadedMedia && req.uploadedMedia.length > 0) {
      // Check for video (not allowed for free users)
      const hasVideo = req.uploadedMedia.some(m =>
        m.type === 'video' ||
        /\.(mp4|mov|avi|mkv|webm)$/i.test(m.filename || '')
      );

      if (hasVideo) {
        return res.status(403).json({
          success: false,
          message: "Video uploads are only available for premium users.",
        });
      }

      // Calculate total media count (existing + new)
      const totalMediaCount = entry.media.length + req.uploadedMedia.length;
      if (totalMediaCount > 1) {
        return res.status(403).json({
          success: false,
          message: "Free users can only have 1 media file per entry.",
        });
      }
    }

    // Update fields if provided (including empty strings) — encrypt before saving
    if (title !== undefined) entry.title = title ? require("../utils/encryption").encrypt(title) : title;
    if (description !== undefined) entry.description = description ? require("../utils/encryption").encrypt(description) : description;

    // Parse and update location if provided (or clear if null)
    if (location !== undefined) {
      if (location === null || location === "null") {
        // Clear location by setting to default empty location
        entry.location = {
          type: "Point",
          coordinates: [0, 0],
          address: "",
        };
      } else {
        try {
          const parsedLocation = typeof location === "string" ? JSON.parse(location) : location;
          // Encrypt location address
          if (parsedLocation.address) {
            parsedLocation.address = require("../utils/encryption").encrypt(parsedLocation.address);
          }
          entry.location = parsedLocation;
        } catch (e) {
          console.error("Error parsing location:", e);
        }
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

    // Update createdAt if provided
    if (createdAt !== undefined) {
      const parsedDate = new Date(createdAt);
      if (!isNaN(parsedDate.getTime())) {
        entry.createdAt = parsedDate;
      }
    }

    // Add new media if uploaded (encrypt URLs before saving)
    if (req.uploadedMedia && req.uploadedMedia.length > 0) {
      const { encrypt } = require("../utils/encryption");
      const encryptedMedia = req.uploadedMedia.map(m => ({
        ...m,
        url: m.url ? encrypt(m.url) : m.url,
        publicId: m.publicId ? encrypt(m.publicId) : m.publicId,
        filename: m.filename ? encrypt(m.filename) : m.filename,
      }));
      entry.media.push(...encryptedMedia);
    }

    // Validate that at least title or description exists
    if (!entry.title && !entry.description) {
      return res.status(400).json({
        success: false,
        message: "At least title or description is required",
      });
    }

    entry.isEncrypted = true;
    await entry.save();
    await entry.populate("user", "name email avatar");

    // Decrypt fields before sending response
    const decryptedEntry = decryptEntryFields(entry);

    return res.json({
      success: true,
      message: "Entry updated successfully",
      entry: decryptedEntry,
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

    // Delete all associated media from Cloudinary (decrypt publicId first)
    if (entry.media && entry.media.length > 0) {
      const { decrypt } = require("../utils/encryption");
      const deletePromises = entry.media.map((media) => {
        const publicId = decrypt(media.publicId);
        return deleteFromCloudinary(publicId).catch((err) => {
          console.error(`Failed to delete media ${publicId}:`, err);
        });
      });
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

    // Delete from Cloudinary (decrypt publicId first)
    try {
      const { decrypt } = require("../utils/encryption");
      await deleteFromCloudinary(decrypt(media.publicId));
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

// Search entries by title, description, or location
// Since data is encrypted, we decrypt all user entries and filter in memory
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

    // Fetch all user entries and decrypt them for searching
    const allEntries = await Entry.find({ user: userId })
      .sort("-createdAt")
      .populate("user", "name email avatar")
      .exec();

    const decryptedAll = decryptEntries(allEntries);

    // Filter by search query (case-insensitive)
    const lowerQuery = query.toLowerCase();
    const matched = decryptedAll.filter(entry => {
      const title = (entry.title || '').toLowerCase();
      const description = (entry.description || '').toLowerCase();
      const address = (entry.location?.address || '').toLowerCase();
      return title.includes(lowerQuery) || description.includes(lowerQuery) || address.includes(lowerQuery);
    });

    // Paginate results
    const count = matched.length;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const paginatedEntries = matched.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    return res.json({
      success: true,
      entries: paginatedEntries,
      totalPages: Math.ceil(count / limitNum),
      currentPage: pageNum,
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

    // Decrypt entries before sending response
    const decryptedEntries = decryptEntries(entries);

    return res.json({
      success: true,
      entries: decryptedEntries,
      totalEntries: decryptedEntries.length,
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
