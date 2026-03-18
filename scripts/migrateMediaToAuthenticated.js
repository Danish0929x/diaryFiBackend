/**
 * Migration script to change existing Cloudinary media from 'upload' (public)
 * to 'authenticated' (requires signed URL).
 *
 * Run once: node scripts/migrateMediaToAuthenticated.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { cloudinary } = require('../config/cloudinary');
const Entry = require('../models/entry.model');
const { decrypt } = require('../utils/encryption');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const entries = await Entry.find({ 'media.0': { $exists: true } });
    console.log(`Found ${entries.length} entries with media`);

    let migratedCount = 0;
    let failedCount = 0;

    for (const entry of entries) {
      for (const media of entry.media) {
        try {
          // Decrypt the publicId to get the real Cloudinary ID
          const publicId = decrypt(media.publicId);

          // Determine resource type
          let resourceType = 'image';
          if (media.type === 'video') resourceType = 'video';
          else if (media.type === 'audio') resourceType = 'video';
          else if (media.type === 'pdf') resourceType = 'raw';

          // Rename from upload to authenticated type
          const result = await cloudinary.uploader.rename(
            publicId,
            publicId,
            {
              resource_type: resourceType,
              type: 'upload',
              to_type: 'authenticated',
              overwrite: true,
            }
          );

          if (result.public_id) {
            migratedCount++;
            console.log(`✓ Migrated: ${publicId} (${media.type})`);
          }
        } catch (err) {
          // Skip if already authenticated or not found
          if (err.message && err.message.includes('already exists')) {
            console.log(`⊘ Already authenticated: ${decrypt(media.publicId)}`);
          } else {
            console.error(`✗ Failed: ${decrypt(media.publicId)} - ${err.message}`);
            failedCount++;
          }
        }
      }
    }

    console.log(`\nMigration complete!`);
    console.log(`Migrated: ${migratedCount}`);
    console.log(`Failed: ${failedCount}`);
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

migrate();
