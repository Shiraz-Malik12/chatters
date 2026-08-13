import { fileTypeFromBuffer } from 'file-type';
import Attachment from '../models/Attachment.js';
import ApiError from '../utils/ApiError.js';
import cloudinaryService from './cloudinaryService.js';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_SIZE_BYTES, MAX_IMAGES_PER_MESSAGE } from '../config/upload.js';

/**
 * Validates uploaded image files by sniffing their actual byte content
 * rather than trusting the browser-supplied mimetype/extension alone.
 * @param {Express.Multer.File[]} files - Files parsed by multer's memoryStorage.
 * @returns {Promise<void>}
 */
const validateFiles = async (files) => {
  if (files.length > MAX_IMAGES_PER_MESSAGE) {
    throw new ApiError(400, `You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message`);
  }

  await Promise.all(
    files.map(async (file) => {
      const label = file.originalname || 'Image';

      if (!file.buffer || file.buffer.length === 0) {
        throw new ApiError(400, `${label} is empty`);
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        throw new ApiError(400, `${label} exceeds the ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB limit`);
      }

      const detected = await fileTypeFromBuffer(file.buffer);

      if (!detected || !ALLOWED_IMAGE_MIME_TYPES.includes(detected.mime)) {
        throw new ApiError(400, `${label} is not a supported image format`);
      }
    })
  );
};

/**
 * Best-effort deletion of Cloudinary assets. Never throws — only logs — so
 * it's safe to call from inside a catch block without masking the original
 * error that triggered the cleanup. `resourceType` defaults to 'image' so
 * every pre-existing call site (all image cleanup, written before video
 * support existed) is unaffected; video cleanup call sites pass it explicitly.
 * Exported so videoUploadService.js can reuse the same cleanup logic instead
 * of duplicating a "delete and swallow errors" loop.
 * @param {{publicId: string, resourceType?: 'image'|'video'}[]} assets - Assets to remove from Cloudinary.
 * @returns {Promise<void>}
 */
export const cleanupCloudinaryAssets = async (assets) => {
  await Promise.all(
    assets.map(async (asset) => {
      try {
        await cloudinaryService.deleteImage(asset.publicId, asset.resourceType || 'image');
      } catch (error) {
        console.error(`[attachments] failed to clean up orphaned Cloudinary asset ${asset.publicId}:`, error.message);
      }
    })
  );
};

/**
 * Uploads already-validated image files to Cloudinary. If any upload in the
 * batch fails, every asset that did succeed is deleted before the error
 * propagates, so a partial failure never leaves orphaned Cloudinary assets.
 * @param {Express.Multer.File[]} files - Validated files to upload.
 * @returns {Promise<Array<{file: Express.Multer.File, result: import('cloudinary').UploadApiResponse}>>}
 */
const uploadFiles = async (files) => {
  const outcomes = await Promise.allSettled(
    files.map(async (file) => ({ file, result: await cloudinaryService.uploadImage(file.buffer) }))
  );

  const succeeded = outcomes.filter((outcome) => outcome.status === 'fulfilled').map((outcome) => outcome.value);
  const failed = outcomes.find((outcome) => outcome.status === 'rejected');

  if (failed) {
    await cleanupCloudinaryAssets(succeeded.map((item) => ({ publicId: item.result.public_id })));
    console.error('[attachments] image upload failed:', failed.reason?.message || failed.reason);
    throw new ApiError(502, 'Failed to upload one or more images, please try again');
  }

  return succeeded;
};

/**
 * Persists Cloudinary upload results as Attachment documents. If the DB
 * write fails, the freshly uploaded Cloudinary assets are cleaned up so they
 * don't become orphaned.
 * @param {Array<{file: Express.Multer.File, result: import('cloudinary').UploadApiResponse}>} uploads - Cloudinary outcomes.
 * @param {string} uploaderId - User id who uploaded the files.
 * @returns {Promise<import('../models/Attachment.js').default[]>}
 */
const persistAttachments = async (uploads, uploaderId) => {
  try {
    return await Attachment.insertMany(
      uploads.map(({ file, result }) => ({
        type: 'image',
        resourceType: 'image',
        // Server-generated Cloudinary public_id — never the user's own filename.
        filename: result.public_id,
        originalName: file.originalname || 'image',
        mimetype: file.mimetype,
        size: file.size,
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        uploadedBy: uploaderId,
      }))
    );
  } catch (error) {
    await cleanupCloudinaryAssets(uploads.map(({ result }) => ({ publicId: result.public_id })));
    console.error('[attachments] failed to save attachment metadata:', error.message);
    throw new ApiError(500, 'Failed to save image attachments');
  }
};

/**
 * Deletes previously persisted attachments (Mongo docs + Cloudinary assets).
 * Best-effort compensating cleanup for when a later step (e.g. Message.create)
 * fails after attachments were already saved. Never throws.
 * @param {import('../models/Attachment.js').default[]} attachments - Attachment docs to remove.
 * @returns {Promise<void>}
 */
export const deleteAttachments = async (attachments) => {
  if (!attachments || attachments.length === 0) return;

  await cleanupCloudinaryAssets(
    attachments.map((attachment) => ({ publicId: attachment.publicId, resourceType: attachment.resourceType }))
  );

  try {
    await Attachment.deleteMany({ _id: { $in: attachments.map((attachment) => attachment._id) } });
  } catch (error) {
    console.error('[attachments] failed to delete orphaned attachment records:', error.message);
  }
};

/**
 * Validates, uploads, and persists image files for a new message in one step.
 * Returns an empty array (no-op) when there are no files, so callers don't
 * need to special-case text-only messages.
 * @param {Express.Multer.File[]} files - Files parsed by multer's memoryStorage.
 * @param {string} uploaderId - User id sending the message.
 * @returns {Promise<import('../models/Attachment.js').default[]>}
 */
export const processAttachments = async (files, uploaderId) => {
  if (!files || files.length === 0) return [];

  await validateFiles(files);
  const uploads = await uploadFiles(files);
  return persistAttachments(uploads, uploaderId);
};
