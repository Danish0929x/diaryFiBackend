const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["image", "video", "audio", "pdf"],
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  publicId: {
    type: String, // Cloudinary public ID for deletion
    required: true,
  },
  filename: {
    type: String,
  },
  size: {
    type: Number, // File size in bytes
  },
  duration: {
    type: Number, // For audio/video duration in seconds
  },
});

const entrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    journal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Journal",
      index: true,
    },
    title: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
      default: "",
    },
    description: {
      type: String,
      required: false,
      trim: true,
      default: "",
    },
    formatSpans: [
      {
        start: { type: Number, required: true },
        end: { type: Number, required: true },
        bold: { type: Boolean, default: false },
        italic: { type: Boolean, default: false },
        underline: { type: Boolean, default: false },
        strikethrough: { type: Boolean, default: false },
        headingLevel: { type: Number },
      },
    ],
    media: [mediaSchema],
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
      address: {
        type: String,
        trim: true,
      },
    },
    // Explicitly defined so it can be updated (timestamps:true makes it immutable by default)
    createdAt: {
      type: Date,
      immutable: false,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Index for geospatial queries
entrySchema.index({ "location.coordinates": "2dsphere" });

// Index for faster user queries
entrySchema.index({ user: 1, createdAt: -1 });

// Virtual for media count
entrySchema.virtual("mediaCount").get(function () {
  return this.media ? this.media.length : 0;
});

// Method to add media
entrySchema.methods.addMedia = function (mediaData) {
  this.media.push(mediaData);
  return this.save();
};

// Method to remove media
entrySchema.methods.removeMedia = function (mediaId) {
  this.media = this.media.filter(
    (item) => item._id.toString() !== mediaId.toString()
  );
  return this.save();
};

// Static method to find entries near a location
entrySchema.statics.findNearby = function (longitude, latitude, maxDistance = 10000) {
  return this.find({
    "location.coordinates": {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: maxDistance, // in meters
      },
    },
  });
};

// Pre-save middleware to ensure location has proper structure
entrySchema.pre("save", function (next) {
  if (this.location && this.location.coordinates) {
    // Ensure coordinates are numbers
    this.location.coordinates = this.location.coordinates.map(Number);
  }
  next();
});

module.exports = mongoose.model("Entry", entrySchema);
