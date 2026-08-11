import { v2 as cloudinary } from 'cloudinary';

/**
 * Configures the shared Cloudinary SDK instance from environment variables.
 * CLOUDINARY_API_SECRET never leaves the backend process — it is only ever
 * read here, from process.env, and used server-side by the Cloudinary SDK.
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;
