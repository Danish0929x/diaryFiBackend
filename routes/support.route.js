const express = require("express");
const router = express.Router();
const supportController = require("../controllers/support.controller");

// Send support email (public endpoint - no authentication required for support)
router.post("/send-email", supportController.sendSupportEmail);

module.exports = router;
