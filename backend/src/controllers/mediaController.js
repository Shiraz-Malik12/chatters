import asyncHandler from '../middleware/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { createVideoUploadAuthorization } from '../services/videoUploadService.js';

/**
 * Authorizes a direct, signed browser-to-Cloudinary video upload for a
 * specific conversation. Requires authentication and conversation
 * membership (enforced inside the service) before any signature is issued.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const requestVideoUploadSignature = asyncHandler(async (req, res) => {
  const { conversationId } = req.body;

  if (!conversationId || typeof conversationId !== 'string') {
    throw new ApiError(400, 'conversationId is required');
  }

  const authorization = await createVideoUploadAuthorization(conversationId, String(req.user.id));

  res.status(200).json(ApiResponse.success(authorization, 'Video upload authorized'));
});
