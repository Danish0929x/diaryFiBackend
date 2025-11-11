const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  uploadMultipleMedia,
  processMediaFiles,
} = require("../middleware/upload");
const entryController = require("../controllers/entry.controller");

// All routes require authentication
router.use(auth);

// Create a new entry with media upload
router.post(
  "/",
  uploadMultipleMedia,
  processMediaFiles,
  entryController.createEntry
);

// Get all entries for the authenticated user
router.get("/", entryController.getUserEntries);

// Search entries
router.get("/search", entryController.searchEntries);

// Get nearby entries
router.get("/nearby", entryController.getNearbyEntries);

// Get entry statistics
router.get("/stats", entryController.getEntryStats);

// Get a single entry by ID
router.get("/:id", entryController.getEntryById);

// Update an entry (with optional media upload)
router.put(
  "/:id",
  uploadMultipleMedia,
  processMediaFiles,
  entryController.updateEntry
);

// Delete an entry
router.delete("/:id", entryController.deleteEntry);

// Delete a specific media item from an entry
router.delete("/:id/media/:mediaId", entryController.deleteMediaFromEntry);

module.exports = router;
