/**
 * Migration script to encrypt all existing unencrypted entries in the database.
 * Run once: node scripts/migrateEncryption.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Entry = require('../models/entry.model');
const { encrypt } = require('../utils/encryption');

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all entries that are NOT yet encrypted
    const entries = await Entry.find({ isEncrypted: { $ne: true } });
    console.log(`Found ${entries.length} unencrypted entries to migrate`);

    let migrated = 0;
    let skipped = 0;

    for (const entry of entries) {
      try {
        // Encrypt title
        if (entry.title) {
          entry.title = encrypt(entry.title);
        }
        // Encrypt description
        if (entry.description) {
          entry.description = encrypt(entry.description);
        }
        // Encrypt location address
        if (entry.location && entry.location.address) {
          entry.location.address = encrypt(entry.location.address);
        }

        entry.isEncrypted = true;
        await entry.save();
        migrated++;

        if (migrated % 50 === 0) {
          console.log(`Progress: ${migrated}/${entries.length} entries encrypted`);
        }
      } catch (err) {
        console.error(`Failed to encrypt entry ${entry._id}:`, err.message);
        skipped++;
      }
    }

    console.log(`\nMigration complete!`);
    console.log(`Encrypted: ${migrated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Total: ${entries.length}`);
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

migrate();
