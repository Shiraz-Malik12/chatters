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

/**
 * Videos never pass through this Node process (see services/videoUploadService.js
 * — the browser uploads directly to Cloudinary with a short-lived signature),
 * so these limits aren't enforced by a multer middleware the way image limits
 * are. Instead they're enforced by: (1) `allowed_formats` baked into the
 * signed upload params, so Cloudinary itself rejects a disallowed format at
 * upload time, and (2) a post-upload check against the *verified* Cloudinary
 * asset (never client-claimed size) before it's ever attached to a message.
 */

/** Maximum number of videos allowed on a single message. */
export const MAX_VIDEOS_PER_MESSAGE = Number(process.env.MAX_VIDEOS_PER_MESSAGE) || 2;

/** Maximum size per video, in megabytes. Kept under Cloudinary's ~100MB single-request upload ceiling to avoid needing chunked/resumable uploads. */
export const MAX_VIDEO_SIZE_MB = Number(process.env.MAX_VIDEO_SIZE_MB) || 100;

/** Maximum size per video, in bytes (derived from MAX_VIDEO_SIZE_MB). */
export const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

/** Video container formats accepted — intentionally conservative (see Cloudinary `format` on the verified asset, not the client-supplied extension/mimetype). */
export const ALLOWED_VIDEO_FORMATS = ['mp4', 'webm'];

/** Frontend-facing MIME-type equivalents of ALLOWED_VIDEO_FORMATS, for `<input accept>` and client-side UX validation only — never trusted as a security boundary. */
export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'];

/** How long a signed video-upload authorization stays valid before its PendingUpload record self-expires (MongoDB TTL index) and the signature becomes unusable. */
export const PENDING_VIDEO_UPLOAD_TTL_MINUTES = Number(process.env.PENDING_VIDEO_UPLOAD_TTL_MINUTES) || 15;

/** Cloudinary folder root for direct-uploaded conversation videos; the full path also embeds the conversation id — see videoUploadService.js. */
export const VIDEO_UPLOAD_FOLDER_ROOT = 'chatters/conversations';
