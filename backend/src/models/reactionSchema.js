import mongoose from 'mongoose';

/**
 * Shared reaction sub-schema: one document per distinct emoji, holding the
 * list of user ids who reacted with it. Used on both Message.reactions
 * (backend/src/models/Message.js) and Attachment.reactions
 * (backend/src/models/Attachment.js) so per-image reactions behave exactly
 * like whole-message reactions.
 */
const reactionSchema = new mongoose.Schema(
  {
    emoji: {
      type: String,
      required: true,
      trim: true,
    },
    users: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
  },
  { _id: false }
);

export default reactionSchema;
