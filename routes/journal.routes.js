const express = require("express");
const router = express.Router();
const journalController = require("../controllers/journal.controller");
const auth = require("../middleware/auth");

// All routes require authentication
router.use(auth);

// Get all journals for the authenticated user
router.get("/", journalController.getJournals);

// Get a single journal by ID
router.get("/:id", journalController.getJournalById);

// Create a new journal
router.post("/", journalController.createJournal);

// Update a journal
router.put("/:id", journalController.updateJournal);

// Delete a journal
router.delete("/:id", journalController.deleteJournal);

module.exports = router;
