const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Get encryption key from environment variable
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  // Hash the key to ensure it's exactly 32 bytes for AES-256
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a string using AES-256-GCM
 * Returns base64 string in format: iv:authTag:ciphertext
 */
function encrypt(text) {
  if (!text || typeof text !== 'string') return text;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with encrypt()
 * Expects base64 string in format: iv:authTag:ciphertext
 */
function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') return encryptedText;

  // Check if it looks like encrypted data (has the iv:tag:cipher format)
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText; // Not encrypted, return as-is

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (e) {
    // If decryption fails, return original text (likely not encrypted)
    console.error('Decryption failed, returning original text:', e.message);
    return encryptedText;
  }
}

/**
 * Encrypt entry fields (title, description, location address, media URLs)
 */
function encryptEntryFields(entryData) {
  if (entryData.title) {
    entryData.title = encrypt(entryData.title);
  }
  if (entryData.description) {
    entryData.description = encrypt(entryData.description);
  }
  if (entryData.location && entryData.location.address) {
    entryData.location.address = encrypt(entryData.location.address);
  }
  // Encrypt media URLs
  if (entryData.media && Array.isArray(entryData.media)) {
    entryData.media = entryData.media.map(m => ({
      ...m,
      url: m.url ? encrypt(m.url) : m.url,
      publicId: m.publicId ? encrypt(m.publicId) : m.publicId,
      filename: m.filename ? encrypt(m.filename) : m.filename,
    }));
  }
  return entryData;
}

/**
 * Decrypt entry fields (title, description, location address, media URLs)
 * Works on a plain object or Mongoose document converted to object
 */
function decryptEntryFields(entry) {
  if (!entry) return entry;

  const obj = entry.toObject ? entry.toObject() : { ...entry };

  if (obj.title) {
    obj.title = decrypt(obj.title);
  }
  if (obj.description) {
    obj.description = decrypt(obj.description);
  }
  if (obj.location && obj.location.address) {
    obj.location.address = decrypt(obj.location.address);
  }
  // Decrypt media and generate signed URLs
  if (obj.media && Array.isArray(obj.media)) {
    const { generateSignedUrl } = require("../middleware/upload");
    obj.media = obj.media.map(m => {
      const decryptedPublicId = m.publicId ? decrypt(m.publicId) : m.publicId;
      const decryptedFilename = m.filename ? decrypt(m.filename) : m.filename;

      // Determine resource type for signed URL
      let resourceType = "image";
      if (m.type === "video") resourceType = "video";
      else if (m.type === "audio") resourceType = "video";
      else if (m.type === "pdf") resourceType = "raw";

      // Generate a signed URL (expires in 1 hour) instead of returning raw URL
      const signedUrl = decryptedPublicId
        ? generateSignedUrl(decryptedPublicId, resourceType)
        : (m.url ? decrypt(m.url) : m.url);

      return {
        ...m,
        url: signedUrl || (m.url ? decrypt(m.url) : m.url),
        publicId: decryptedPublicId,
        filename: decryptedFilename,
      };
    });
  }
  return obj;
}

/**
 * Decrypt an array of entries
 */
function decryptEntries(entries) {
  return entries.map(entry => decryptEntryFields(entry));
}

module.exports = {
  encrypt,
  decrypt,
  encryptEntryFields,
  decryptEntryFields,
  decryptEntries,
};
