/**
 * Central limits for message image attachments. Keeping these in one place
 * avoids magic numbers scattered across the multer middleware and services.
 */

/** Maximum number of images allowed on a single message. */
export const MAX_IMAGES_PER_MESSAGE = Number(process.env.MAX_IMAGES_PER_MESSAGE) || 5;

/** Maximum size per image, in megabytes. */
export const MAX_IMAGE_SIZE_MB = Number(process.env.MAX_IMAGE_SIZE_MB) || 10;

/** Maximum size per image, in bytes (derived from MAX_IMAGE_SIZE_MB). */
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

/**
 * Image formats accepted for message attachments. Validated both by
 * declared MIME type (fast, cheap rejection) and by sniffing the actual
 * file signature (authoritative) — see middleware/uploadMiddleware.js.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Multipart field name the frontend must use for image files. */
export const IMAGE_FIELD_NAME = 'images';
