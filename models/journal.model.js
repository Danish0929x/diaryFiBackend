const mongoose = require("mongoose");

const journalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    color: {
      type: String,
      default: "#3B9EFF",
      trim: true,
    },
    icon: {
      type: String,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    clientLocalId: {
      type: String,
      sparse: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster user queries
journalSchema.index({ user: 1, createdAt: -1 });

// Index for incremental sync (updatedSince queries)
journalSchema.index({ user: 1, updatedAt: -1 });

// Virtual for entry count
journalSchema.virtual("entryCount", {
  ref: "Entry",
  localField: "_id",
  foreignField: "journal",
  count: true,
});

// Ensure virtuals are included in JSON output
journalSchema.set("toJSON", { virtuals: true });
journalSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Journal", journalSchema);
