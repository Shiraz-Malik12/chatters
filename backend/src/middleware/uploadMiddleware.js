import multer from 'multer';
import ApiError from '../utils/ApiError.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  IMAGE_FIELD_NAME,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGES_PER_MESSAGE,
} from '../config/upload.js';

// Memory storage only — buffers live in process memory just long enough to
// validate and stream to Cloudinary, never touching local disk. Suitable for
// stateless/containerized deployments with no persistent filesystem.
const storage = multer.memoryStorage();

/**
 * Cheap first-pass filter on the browser-declared MIME type. This alone is
 * never trusted for security — attachmentService re-validates the real file
 * signature from the buffer before anything reaches Cloudinary.
 * @param {import('express').Request} req - Express request object.
 * @param {Express.Multer.File} file - File currently being parsed.
 * @param {import('multer').FileFilterCallback} cb - Multer filter callback.
 * @returns {void}
 */
const fileFilter = (req, file, cb) => {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    const error = new Error(`Unsupported image type: ${file.mimetype}`);
    error.code = 'UNSUPPORTED_FILE_TYPE';
    cb(error);
    return;
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: MAX_IMAGES_PER_MESSAGE,
  },
  fileFilter,
});

const imagesUpload = upload.array(IMAGE_FIELD_NAME, MAX_IMAGES_PER_MESSAGE);

/**
 * Parses `multipart/form-data` image uploads for the send-message endpoint.
 * Requests sent as plain `application/json` (text-only messages) pass through
 * untouched, since multer only engages for multipart bodies — this is what
 * lets one endpoint serve both content types without a separate route.
 *
 * Any multer failure (oversized file, too many files, unsupported type) is
 * converted into an ApiError so it flows through the app's normal error
 * handler instead of surfacing as an unhandled MulterError.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next callback.
 * @returns {void}
 */
const handleImageUpload = (req, res, next) => {
  imagesUpload(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error.code === 'UNSUPPORTED_FILE_TYPE') {
      next(new ApiError(400, error.message));
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new ApiError(413, `Each image must be smaller than ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`));
        return;
      }

      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        next(
          new ApiError(
            400,
            `You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message, using field "${IMAGE_FIELD_NAME}"`
          )
        );
        return;
      }

      next(new ApiError(400, 'Invalid image upload'));
      return;
    }

    next(error);
  });
};

export default handleImageUpload;
