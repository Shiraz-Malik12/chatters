// Mirrors backend/src/config/upload.js so the UI can reject obviously
// invalid files immediately, before spending a round trip on the server
// (which remains the authoritative validator).
export const MAX_IMAGES_PER_MESSAGE = 5;
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Videos never pass through our backend (see api/media.js — they're signed
// and uploaded straight to Cloudinary), but the same "reject obviously
// invalid files before a round trip" logic still applies client-side, and
// these mirror backend/src/config/upload.js's video limits.
export const MAX_VIDEOS_PER_MESSAGE = 2;
export const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;
export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'];

/** Combined accept list for the single attachment file input. */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [...ALLOWED_IMAGE_MIME_TYPES, ...ALLOWED_VIDEO_MIME_TYPES];

export const isImageFile = (file) => ALLOWED_IMAGE_MIME_TYPES.includes(file.type);
export const isVideoFile = (file) => ALLOWED_VIDEO_MIME_TYPES.includes(file.type);

export const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Formats seconds as `m:ss` for a video duration badge (e.g. 75.4 -> "1:15"). */
export const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};
