const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { cloudinary } = require("../config/cloudinary");

// Storage configuration for different media types
const createStorage = (folder, allowedFormats, resourceType = "auto") => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: `diaryfi/${folder}`,
      resource_type: resourceType,
      allowed_formats: allowedFormats,
      transformation:
        resourceType === "image"
          ? [{ width: 1920, height: 1080, crop: "limit" }, { quality: "auto" }]
          : undefined,
    },
  });
};

// Storage for images
const imageStorage = createStorage(
  "images",
  ["jpg", "jpeg", "png", "gif", "webp"],
  "image"
);

// Storage for videos
const videoStorage = createStorage(
  "videos",
  ["mp4", "mov", "avi", "mkv", "webm"],
  "video"
);

// Storage for audio
const audioStorage = createStorage(
  "audio",
  ["mp3", "wav", "ogg", "m4a", "aac"],
  "video" // Cloudinary uses 'video' resource type for audio
);

// Storage for PDFs
const pdfStorage = createStorage("documents", ["pdf"], "raw");

// File filter to validate file types
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  const allowedVideoTypes = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
    "video/webm",
  ];
  const allowedAudioTypes = [
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/mp4",
    "audio/aac",
  ];
  const allowedPdfTypes = ["application/pdf"];

  const allAllowedTypes = [
    ...allowedImageTypes,
    ...allowedVideoTypes,
    ...allowedAudioTypes,
    ...allowedPdfTypes,
  ];

  if (allAllowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not supported`), false);
  }
};

// Create multer upload instances
const uploadImage = multer({
  storage: imageStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 5MB for images
  },
});

const uploadVideo = multer({
  storage: videoStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 5MB for videos
  },
});

const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB for audio
  },
});

const uploadPdf = multer({
  storage: pdfStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 5MB for PDFs
  },
});

// Universal upload that handles all media types
const uploadMedia = multer({
  storage: multer.memoryStorage(), // Use memory storage for dynamic routing
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 5MB max
  },
});

// Middleware to handle multiple files of different types
const uploadMultipleMedia = uploadMedia.array("media", 10); // Max 10 files

// Helper function to upload file to appropriate folder based on type
const uploadToCloudinary = async (file) => {
  return new Promise((resolve, reject) => {
    const getResourceType = (mimetype) => {
      if (mimetype.startsWith("image/")) return "image";
      if (mimetype.startsWith("video/")) return "video";
      if (mimetype.startsWith("audio/")) return "video"; // Cloudinary uses 'video' for audio
      return "raw";
    };

    const getFolder = (mimetype) => {
      if (mimetype.startsWith("image/")) return "diaryfi/images";
      if (mimetype.startsWith("video/")) return "diaryfi/videos";
      if (mimetype.startsWith("audio/")) return "diaryfi/audio";
      return "diaryfi/documents";
    };

    const getMediaType = (mimetype) => {
      if (mimetype.startsWith("image/")) return "image";
      if (mimetype.startsWith("video/")) return "video";
      if (mimetype.startsWith("audio/")) return "audio";
      if (mimetype === "application/pdf") return "pdf";
      return "unknown";
    };

    const resourceType = getResourceType(file.mimetype);
    const folder = getFolder(file.mimetype);

    cloudinary.uploader
      .upload_stream(
        {
          resource_type: resourceType,
          folder: folder,
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              type: getMediaType(file.mimetype),
              url: result.secure_url,
              publicId: result.public_id,
              filename: file.originalname,
              size: result.bytes,
              duration: result.duration, // Available for video/audio
            });
          }
        }
      )
      .end(file.buffer);
  });
};

// Middleware to process uploaded files
const processMediaFiles = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    const uploadPromises = req.files.map((file) => uploadToCloudinary(file));
    req.uploadedMedia = await Promise.all(uploadPromises);
    next();
  } catch (error) {
    console.error("Media upload error:", error);
    return res.status(400).json({
      success: false,
      message: "Failed to upload media files",
      error: error.message,
    });
  }
};

// Helper function to delete media from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    // Determine resource type from publicId
    let resourceType = "image";
    if (publicId.includes("/videos/")) resourceType = "video";
    else if (publicId.includes("/audio/")) resourceType = "video";
    else if (publicId.includes("/documents/")) resourceType = "raw";

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error);
    throw error;
  }
};

module.exports = {
  uploadImage,
  uploadVideo,
  uploadAudio,
  uploadPdf,
  uploadMedia,
  uploadMultipleMedia,
  processMediaFiles,
  uploadToCloudinary,
  deleteFromCloudinary,
};
