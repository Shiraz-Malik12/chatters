import mongoose from 'mongoose';

/**
 * A short-lived record tying one signed, direct-to-Cloudinary video upload
 * authorization to the exact user + conversation that requested it.
 *
 * Why this exists: the browser uploads the actual video bytes straight to
 * Cloudinary, bypassing this Node process entirely (see
 * services/videoUploadService.js). That means when the browser later asks
 * to attach `{ publicId }` to a message, our backend has no memory of ever
 * issuing that upload — without this record, it would have to blindly trust
 * whatever public_id the client sends. Instead, `createVideoUploadAuthorization`
 * creates one of these *before* handing out a signature, and
 * `verifyAndConsumeVideoRefs` requires a matching, unused, unexpired record
 * (same user, same conversation, same publicId) before the asset can ever be
 * attached to a Message — see PLAN item 6 / spec section 16.
 *
 * The TTL index below makes an unused authorization self-destruct once it
 * expires, so a signature nobody ever redeemed doesn't need any separate
 * sweep/cron job to stop being valid.
 */
const pendingUploadSchema = new mongoose.Schema({
  publicId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  resourceType: {
    type: String,
    enum: ['video'],
    default: 'video',
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // MongoDB TTL index: the document is removed automatically once the
  // clock passes this timestamp (expireAfterSeconds: 0 means "expire
  // exactly at the stored Date", not "N seconds after creation").
  expiresAt: {
    type: Date,
    required: true,
  },
});

pendingUploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PendingUpload = mongoose.model('PendingUpload', pendingUploadSchema);

export default PendingUpload;
