const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    activityType: {
      type: String,
      enum: [
        "entry_created",
        "entry_edited",
        "entry_deleted",
        "journal_created",
        "journal_deleted",
        "journal_updated",
        "entry_shared",
        "media_added",
        "location_added",
        "user_signed_in",
        "user_signed_out",
        "sync_completed",
        "settings_changed",
      ],
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    metadata: {
      entryId: mongoose.Schema.Types.ObjectId,
      journalId: mongoose.Schema.Types.ObjectId,
      mediaType: String,
      details: mongoose.Schema.Types.Mixed,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Index for efficient querying by user and date
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ activityType: 1, createdAt: -1 });

module.exports = mongoose.model("Activity", activitySchema);
