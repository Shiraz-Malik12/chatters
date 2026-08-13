import mongoose from 'mongoose';
import reactionSchema from './reactionSchema.js';

const attachmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['image', 'video'],
      default: 'image',
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    mimetype: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    // Cloudinary public_id, required to delete/manage the asset later (cleanup, moderation, etc.).
    publicId: {
      type: String,
      required: true,
      trim: true,
    },
    // Mirrors Cloudinary's own resource_type ('image' | 'video') — kept
    // separate from `type` above so Cloudinary API calls (destroy, admin
    // lookups) always know which resource_type to pass, independent of any
    // future app-level attachment types that don't map 1:1 to Cloudinary's.
    // Defaulted to 'image' so every attachment created before this field
    // existed keeps validating without a migration.
    resourceType: {
      type: String,
      enum: ['image', 'video'],
      default: 'image',
    },
    width: {
      type: Number,
    },
    height: {
      type: Number,
    },
    // Video-only fields — undefined/absent on image attachments (including
    // every attachment that existed before video support was added).
    duration: {
      type: Number,
    },
    thumbnailUrl: {
      type: String,
      trim: true,
    },
    format: {
      type: String,
      trim: true,
    },
    // Per-image reactions — same shape/semantics as Message.reactions, see
    // services/reactionUtils.js for the shared toggle logic.
    reactions: {
      type: [reactionSchema],
      default: [],
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

const Attachment = mongoose.model('Attachment', attachmentSchema);

export default Attachment;
