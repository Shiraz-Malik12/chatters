import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['image'],
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
    width: {
      type: Number,
    },
    height: {
      type: Number,
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
