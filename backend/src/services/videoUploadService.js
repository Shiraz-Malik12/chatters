import { randomUUID } from 'node:crypto';
import Attachment from '../models/Attachment.js';
import PendingUpload from '../models/PendingUpload.js';
import ApiError from '../utils/ApiError.js';
import cloudinaryService from './cloudinaryService.js';
import { cleanupCloudinaryAssets } from './attachmentService.js';
import { validateParticipant } from './conversationService.js';
import {
  ALLOWED_VIDEO_FORMATS,
  MAX_VIDEO_SIZE_BYTES,
  MAX_VIDEOS_PER_MESSAGE,
  PENDING_VIDEO_UPLOAD_TTL_MINUTES,
  VIDEO_UPLOAD_FOLDER_ROOT,
} from '../config/upload.js';

/**
 * Issues a short-lived, signed authorization for the browser to upload one
 * video file directly to Cloudinary (bypassing this Node process entirely —
 * see PLAN item 5). Only ever hands back non-secret values: cloud name, API
 * key, timestamp, signature, and the exact public_id/allowed_formats the
 * signature was computed over. `CLOUDINARY_API_SECRET` never leaves
 * cloudinaryService.generateUploadSignature.
 * @param {string} conversationId - Conversation the video will belong to.
 * @param {string} userId - Requesting (authenticated) user id.
 * @returns {Promise<object>} Everything the frontend needs to perform the direct upload.
 */
export const createVideoUploadAuthorization = async (conversationId, userId) => {
  // Membership check happens *before* a signature is ever generated — a
  // conversationId alone (from someone who isn't a participant) must not be
  // enough to obtain upload authorization for it.
  await validateParticipant(conversationId, userId);

  // The public_id embeds the conversation id and is entirely server-chosen —
  // never derived from a client-supplied filename — so PendingUpload lookups
  // and Cloudinary's own folder view stay conversation-scoped.
  const publicId = `${VIDEO_UPLOAD_FOLDER_ROOT}/${conversationId}/videos/${randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const allowedFormats = ALLOWED_VIDEO_FORMATS.join(',');

  // Every key here becomes part of the signed payload — the browser must
  // send exactly these values back to Cloudinary, so it can't smuggle in a
  // different public_id/folder or loosen allowed_formats without the
  // signature failing Cloudinary-side.
  const signature = cloudinaryService.generateUploadSignature({
    timestamp,
    public_id: publicId,
    allowed_formats: allowedFormats,
  });

  const expiresAt = new Date(Date.now() + PENDING_VIDEO_UPLOAD_TTL_MINUTES * 60 * 1000);

  await PendingUpload.create({
    publicId,
    resourceType: 'video',
    conversationId,
    uploadedBy: userId,
    expiresAt,
  });

  const { cloudName, apiKey } = cloudinaryService.getPublicConfig();

  return {
    cloudName,
    apiKey,
    timestamp,
    signature,
    publicId,
    allowedFormats: ALLOWED_VIDEO_FORMATS,
    resourceType: 'video',
    maxVideoSizeBytes: MAX_VIDEO_SIZE_BYTES,
    expiresAt: expiresAt.toISOString(),
  };
};

/**
 * Looks up and validates the PendingUpload record backing one client-claimed
 * video ref, without yet touching Cloudinary. Throws on anything that smells
 * like tampering: an unrecognized public_id, a record for a different user,
 * a different conversation, or one already consumed/expired.
 * @param {{publicId: string}} ref - Client-supplied video reference.
 * @param {string} userId - Authenticated requester.
 * @param {string} conversationId - Conversation the message is being sent into.
 * @returns {Promise<import('../models/PendingUpload.js').default>}
 */
const requireOwnedPendingUpload = async (ref, userId, conversationId) => {
  const publicId = typeof ref?.publicId === 'string' ? ref.publicId.trim() : '';

  if (!publicId) {
    throw new ApiError(400, 'A video attachment is missing its publicId');
  }

  const pendingUpload = await PendingUpload.findOne({ publicId });

  // No matching record (never issued, already consumed by an earlier
  // message, or expired and swept by the TTL index) — an arbitrary or
  // reused public_id is rejected exactly the same way as one that never
  // existed, so this doesn't leak which case it was.
  if (
    !pendingUpload ||
    String(pendingUpload.uploadedBy) !== String(userId) ||
    String(pendingUpload.conversationId) !== String(conversationId) ||
    pendingUpload.expiresAt.getTime() < Date.now()
  ) {
    throw new ApiError(403, 'This video was not uploaded through an authorized upload session');
  }

  return pendingUpload;
};

/**
 * Verifies, persists, and returns Attachment documents for a batch of
 * already-directly-uploaded videos. Mirrors attachmentService.processAttachments'
 * shape and safety guarantees (validate → "upload" [here: verify] → persist,
 * all-or-nothing) so the two attachment kinds behave consistently even
 * though the actual bytes took completely different paths to Cloudinary.
 * @param {{publicId: string}[]} videoRefs - Client-supplied refs to verify and attach.
 * @param {string} userId - Requesting (authenticated) user id.
 * @param {string} conversationId - Conversation the message is being sent into.
 * @returns {Promise<import('../models/Attachment.js').default[]>}
 */
export const processVideoAttachments = async (videoRefs, userId, conversationId) => {
  if (!videoRefs || videoRefs.length === 0) return [];

  if (videoRefs.length > MAX_VIDEOS_PER_MESSAGE) {
    throw new ApiError(400, `You can attach up to ${MAX_VIDEOS_PER_MESSAGE} videos per message`);
  }

  const verified = [];

  try {
    for (const ref of videoRefs) {
      // eslint-disable-next-line no-await-in-loop -- each ref's PendingUpload
      // lookup/consumption must be sequential, not racing against itself.
      const pendingUpload = await requireOwnedPendingUpload(ref, userId, conversationId);

      let resource;
      try {
        // The Admin API call is the authoritative check — it can only
        // return a real result for an asset that genuinely finished
        // uploading to Cloudinary as a video. Nothing about width, height,
        // duration, format, or size is ever taken from the client.
        // eslint-disable-next-line no-await-in-loop
        resource = await cloudinaryService.getVideoResource(pendingUpload.publicId);
      } catch (error) {
        throw new ApiError(400, 'The uploaded video could not be verified with Cloudinary');
      }

      // From this point on the Cloudinary asset is confirmed to exist, so it
      // must be tracked for rollback cleanup even if one of the checks below
      // ends up rejecting it — an oversized/wrong-format upload still needs
      // deleting, not just an upload that fails a *later* ref in the batch.
      // The authorization is consumed here too: accepted or rejected, this
      // exact publicId can never be attempted again.
      verified.push({ pendingUpload, resource });
      // eslint-disable-next-line no-await-in-loop
      await pendingUpload.deleteOne();

      if (resource.resource_type !== 'video') {
        throw new ApiError(400, 'Attachment is not a valid video');
      }

      if (!ALLOWED_VIDEO_FORMATS.includes(resource.format)) {
        throw new ApiError(400, `Video format .${resource.format} is not supported`);
      }

      if (resource.bytes > MAX_VIDEO_SIZE_BYTES) {
        throw new ApiError(400, `Video exceeds the ${MAX_VIDEO_SIZE_BYTES / (1024 * 1024)}MB limit`);
      }
    }
  } catch (error) {
    // Roll back whatever *did* verify successfully in this batch before the
    // failure — same all-or-nothing guarantee processAttachments gives
    // images, so a message never ends up with only some of its intended
    // videos attached.
    await cleanupCloudinaryAssets(
      verified.map(({ resource }) => ({ publicId: resource.public_id, resourceType: 'video' }))
    );
    throw error;
  }

  try {
    return await Attachment.insertMany(
      verified.map(({ resource }) => ({
        type: 'video',
        resourceType: 'video',
        filename: resource.public_id,
        originalName: resource.public_id.split('/').pop(),
        mimetype: `video/${resource.format}`,
        size: resource.bytes,
        url: resource.secure_url,
        publicId: resource.public_id,
        width: resource.width,
        height: resource.height,
        duration: resource.duration,
        format: resource.format,
        thumbnailUrl: cloudinaryService.buildVideoThumbnailUrl(resource.public_id),
        uploadedBy: userId,
      }))
    );
  } catch (error) {
    await cleanupCloudinaryAssets(
      verified.map(({ resource }) => ({ publicId: resource.public_id, resourceType: 'video' }))
    );
    console.error('[video-upload] failed to save video attachment metadata:', error.message);
    throw new ApiError(500, 'Failed to save video attachments');
  }
};
