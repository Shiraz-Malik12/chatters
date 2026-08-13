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
 * Deletes a previously uploaded asset from Cloudinary by its public id.
 * Defaults to 'image' so every existing call site (all of them predating
 * video support) keeps behaving exactly as before without changes.
 * @param {string} publicId - Cloudinary public_id to remove.
 * @param {'image'|'video'} [resourceType='image'] - Cloudinary resource type.
 * @returns {Promise<import('cloudinary').DeleteApiResponse>} Cloudinary destroy result.
 */
const deleteImage = (publicId, resourceType = 'image') =>
  cloudinary.uploader.destroy(publicId, { resource_type: resourceType });

/**
 * Signs a set of upload parameters server-side for a short-lived, direct
 * browser-to-Cloudinary upload. Every key in `paramsToSign` becomes part of
 * the signed payload — the browser can send exactly these values and no
 * others; changing even one (e.g. swapping `public_id` to write into a
 * different conversation's folder) invalidates the signature and Cloudinary
 * rejects the upload outright. The API secret is read from the already-
 * configured SDK instance and never returned to any caller.
 * @param {Record<string, string|number>} paramsToSign - Upload params to sign (timestamp, public_id, allowed_formats, ...).
 * @returns {string} The computed signature.
 */
const generateUploadSignature = (paramsToSign) => cloudinary.utils.api_sign_request(paramsToSign, cloudinary.config().api_secret);

/**
 * Looks up a Cloudinary asset via the (server-only) Admin API — the
 * authoritative source of truth for "does this asset actually exist, and is
 * it actually a video". Used to verify a client-reported public_id before
 * ever trusting its metadata (duration, size, format, dimensions).
 * @param {string} publicId - Cloudinary public_id to look up.
 * @returns {Promise<import('cloudinary').ResourceApiResponse>}
 */
const getVideoResource = (publicId) => cloudinary.api.resource(publicId, { resource_type: 'video' });

/**
 * Builds a deterministic poster-frame URL for a video asset (Cloudinary
 * derives it on the fly from the first frame) — no separate thumbnail
 * upload/generation step required.
 * @param {string} publicId - Cloudinary public_id of the video.
 * @returns {string} Thumbnail image URL.
 */
const buildVideoThumbnailUrl = (publicId) =>
  cloudinary.url(publicId, {
    resource_type: 'video',
    format: 'jpg',
    transformation: [{ width: 400, crop: 'limit' }],
  });

/**
 * Cloud name and API key are not secret — the browser needs them to know
 * which Cloudinary account to POST a signed upload to. Only api_secret is
 * ever withheld (it's read directly from `cloudinary.config()` server-side
 * in generateUploadSignature and never included in any returned object).
 * @returns {{cloudName: string, apiKey: string}}
 */
const getPublicConfig = () => ({
  cloudName: cloudinary.config().cloud_name,
  apiKey: cloudinary.config().api_key,
});

// Exported as a plain object (rather than named exports) so tests can mock
// individual methods with node:test's mock.method without fighting ESM's
// read-only module namespace bindings.
const cloudinaryService = {
  uploadImage,
  deleteImage,
  generateUploadSignature,
  getVideoResource,
  buildVideoThumbnailUrl,
  getPublicConfig,
};

export default cloudinaryService;
