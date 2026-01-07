const Journal = require("../models/journal.model");

// Get all journals for the authenticated user
exports.getJournals = async (req, res) => {
  try {
    const journals = await Journal.find({ user: req.user.userId })
      .sort({ createdAt: 1 }) // Sort oldest first, so "Journal" comes first for new users
      .populate("entryCount");

    res.status(200).json({
      success: true,
      journals,
    });
  } catch (error) {
    console.error("Error fetching journals:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch journals",
      error: error.message,
    });
  }
};

// Get a single journal by ID
exports.getJournalById = async (req, res) => {
  try {
    const { id } = req.params;

    const journal = await Journal.findOne({
      _id: id,
      user: req.user.userId,
    }).populate("entryCount");

    if (!journal) {
      return res.status(404).json({
        success: false,
        message: "Journal not found",
      });
    }

    res.status(200).json({
      success: true,
      journal,
    });
  } catch (error) {
    console.error("Error fetching journal:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch journal",
      error: error.message,
    });
  }
};

// Create a new journal
exports.createJournal = async (req, res) => {
  try {
    const { name, description, color, icon } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Journal name is required",
      });
    }

    // Get user to check premium status
    const User = require("../models/user.model");
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check journal limit for free users (3 journals max)
    if (!user.isPremium) {
      const journalCount = await Journal.countDocuments({ user: req.user.userId });
      if (journalCount >= 3) {
        return res.status(403).json({
          success: false,
          message: "Free users can create maximum 3 journals. Upgrade to premium for unlimited journals.",
        });
      }
    }

    const journal = new Journal({
      user: req.user.userId,
      name: name.trim(),
      description: description?.trim(),
      color: color || "#3B9EFF",
      icon,
    });

    await journal.save();

    // Populate entryCount
    await journal.populate("entryCount");

    res.status(201).json({
      success: true,
      message: "Journal created successfully",
      journal,
    });
  } catch (error) {
    console.error("Error creating journal:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create journal",
      error: error.message,
    });
  }
};

// Update a journal
exports.updateJournal = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, icon } = req.body;

    const journal = await Journal.findOne({
      _id: id,
      user: req.user.userId,
    });

    if (!journal) {
      return res.status(404).json({
        success: false,
        message: "Journal not found",
      });
    }

    // Update fields if provided
    if (name !== undefined) journal.name = name.trim();
    if (description !== undefined) journal.description = description?.trim();
    if (color !== undefined) journal.color = color;
    if (icon !== undefined) journal.icon = icon;

    await journal.save();

    // Populate entryCount
    await journal.populate("entryCount");

    res.status(200).json({
      success: true,
      message: "Journal updated successfully",
      journal,
    });
  } catch (error) {
    console.error("Error updating journal:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update journal",
      error: error.message,
    });
  }
};

// Delete a journal
exports.deleteJournal = async (req, res) => {
  try {
    const { id } = req.params;

    const journal = await Journal.findOne({
      _id: id,
      user: req.user.userId,
    });

    if (!journal) {
      return res.status(404).json({
        success: false,
        message: "Journal not found",
      });
    }

    // Optional: Remove journal reference from all entries
    // Or you can set entries' journal field to null
    const Entry = require("../models/entry.model");
    await Entry.updateMany(
      { journal: id },
      { $unset: { journal: "" } }
    );

    await Journal.deleteOne({ _id: id });

    res.status(200).json({
      success: true,
      message: "Journal deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting journal:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete journal",
      error: error.message,
    });
  }
};
