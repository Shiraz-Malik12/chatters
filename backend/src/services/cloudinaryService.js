import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import cloudinary from '../config/cloudinary.js';

const MESSAGE_ATTACHMENTS_FOLDER = 'chatters/messages';

/**
 * Uploads a single image buffer to Cloudinary using a streaming upload,
 * which pairs naturally with Multer's memoryStorage (no temp files on disk).
 * @param {Buffer} buffer - Raw image bytes already validated by the caller.
 * @returns {Promise<import('cloudinary').UploadApiResponse>} Cloudinary upload result.
 */
const uploadImage = (buffer) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: MESSAGE_ATTACHMENTS_FOLDER,
        // Server-generated id — never derived from the user-supplied filename.
        public_id: randomUUID(),
        resource_type: 'image',
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      }
    );

    Readable.from(buffer).pipe(uploadStream);
  });

/**
 * Deletes a previously uploaded image from Cloudinary by its public id.
 * @param {string} publicId - Cloudinary public_id to remove.
 * @returns {Promise<import('cloudinary').DeleteApiResponse>} Cloudinary destroy result.
 */
const deleteImage = (publicId) => cloudinary.uploader.destroy(publicId, { resource_type: 'image' });

// Exported as a plain object (rather than named exports) so tests can mock
// individual methods with node:test's mock.method without fighting ESM's
// read-only module namespace bindings.
const cloudinaryService = { uploadImage, deleteImage };

export default cloudinaryService;
