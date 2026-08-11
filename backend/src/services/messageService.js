import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import '../models/Attachment.js';
import ApiError from '../utils/ApiError.js';
import { validateParticipant } from './conversationService.js';
import { deleteAttachments, processAttachments } from './attachmentService.js';

const ATTACHMENT_POPULATE_FIELDS = 'type url mimetype size width height originalName publicId';

/**
 * Escapes regex special characters in user-provided search query.
 * @param {string} value - Raw search string.
 * @returns {string}
 */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Converts and validates an ObjectId.
 * @param {string} id - Value to validate.
 * @param {string} fieldName - Field label for error messages.
 * @returns {mongoose.Types.ObjectId}
 */
const toObjectId = (id, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }

  return new mongoose.Types.ObjectId(id);
};

/**
 * Validates private conversation block relationship before sending messages.
 * @param {import('../models/Conversation.js').default} conversation - Conversation document.
 * @param {string} senderId - Sender user id.
 * @returns {Promise<void>}
 */
const assertPrivateMessagingAllowed = async (conversation, senderId) => {
  if (conversation.type !== 'private') {
    return;
  }

  const senderParticipant = conversation.participants.find((participant) => String(participant.user) === String(senderId));

  if (!senderParticipant) {
    throw new ApiError(403, 'You do not have access to this conversation');
  }

  const recipientParticipant = conversation.participants.find((participant) => String(participant.user) !== String(senderId));

  if (!recipientParticipant) {
    throw new ApiError(400, 'Private conversation is invalid');
  }

  const users = await User.find({
    _id: { $in: [senderParticipant.user, recipientParticipant.user] },
  }).select('blockedUsers');

  if (users.length !== 2) {
    throw new ApiError(404, 'Conversation participant not found');
  }

  const [a, b] = users;
  const blocked =
    (a.blockedUsers || []).some((id) => String(id) === String(b._id)) ||
    (b.blockedUsers || []).some((id) => String(id) === String(a._id));

  if (blocked) {
    throw new ApiError(403, 'Blocked users cannot message each other');
  }
};

/**
 * Sends a message to a conversation. Accepts either text, image attachments,
 * or both — at least one of the two is required. Works identically for
 * private and group conversations since both share this one code path.
 * @param {string} conversationId - Conversation id.
 * @param {string} senderId - Sender user id.
 * @param {string} content - Message text content (may be empty if files are attached).
 * @param {'text'|'image'|'file'|'system'} [type='text'] - Requested message type; forced to 'image' when files are attached.
 * @param {Express.Multer.File[]} [files=[]] - Image files parsed by multer's memoryStorage, if any.
 * @returns {Promise<import('../models/Message.js').default>}
 */
export const sendMessage = async (conversationId, senderId, content, type = 'text', files = []) => {
  const conversation = await validateParticipant(conversationId, senderId);
  await assertPrivateMessagingAllowed(conversation, senderId);

  const normalizedContent = typeof content === 'string' ? content.trim() : '';
  const hasFiles = Array.isArray(files) && files.length > 0;

  if (!normalizedContent && !hasFiles) {
    throw new ApiError(400, 'Message must contain text or at least one image');
  }

  // Images are validated, uploaded to Cloudinary, and persisted as Attachment
  // docs before the Message is created — never after, and never before the
  // membership check above, so an unauthorized caller can't trigger uploads.
  const attachments = await processAttachments(files, senderId);
  const normalizedType = hasFiles ? 'image' : type || 'text';

  let message;

  try {
    message = await Message.create({
      conversationId: conversation._id,
      sender: toObjectId(senderId, 'senderId'),
      content: normalizedContent,
      type: normalizedType,
      attachments: attachments.map((attachment) => attachment._id),
      readBy: [{ user: senderId, readAt: new Date() }],
    });
  } catch (error) {
    // Message failed to save after attachments were already uploaded — clean
    // up so nothing is orphaned in Cloudinary/MongoDB, then rethrow as-is.
    await deleteAttachments(attachments);
    throw error;
  }

  conversation.lastMessage = message._id;
  conversation.participants = conversation.participants.map((participant) => {
    if (String(participant.user) === String(senderId)) {
      return {
        ...participant.toObject(),
        lastRead: new Date(),
      };
    }

    return participant;
  });

  await conversation.save();

  return Message.findById(message._id)
    .populate({ path: 'sender', select: 'name avatar' })
    .populate({ path: 'attachments', select: ATTACHMENT_POPULATE_FIELDS })
    .populate({ path: 'replyTo', select: 'sender content type createdAt isDeleted' });
};

/**
 * Returns cursor-paginated conversation messages.
 * @param {string} conversationId - Conversation id.
 * @param {string | undefined} cursor - CreatedAt ISO cursor.
 * @param {number} [limit=20] - Page size.
 * @param {string} userId - Requesting user id.
 * @returns {Promise<{messages: import('../models/Message.js').default[], nextCursor: string | null, hasNext: boolean}>}
 */
export const getMessages = async (conversationId, cursor, limit = 20, userId) => {
  await validateParticipant(conversationId, userId);

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const query = {
    conversationId: toObjectId(conversationId, 'conversationId'),
    deletedFor: { $ne: toObjectId(userId, 'userId') },
  };

  if (cursor) {
    const cursorDate = new Date(cursor);

    if (Number.isNaN(cursorDate.getTime())) {
      throw new ApiError(400, 'Invalid cursor');
    }

    query.createdAt = { $lt: cursorDate };
  }

  const docs = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(safeLimit + 1)
    .populate({ path: 'sender', select: 'name avatar' })
    .populate({ path: 'attachments', select: ATTACHMENT_POPULATE_FIELDS })
    .populate({ path: 'replyTo', select: 'sender content type createdAt isDeleted' });

  const hasNext = docs.length > safeLimit;
  const messages = hasNext ? docs.slice(0, safeLimit) : docs;
  const nextCursor = hasNext ? messages[messages.length - 1].createdAt.toISOString() : null;

  return {
    messages,
    nextCursor,
    hasNext,
  };
};

/**
 * Edits a message authored by the requesting user.
 * @param {string} messageId - Message id.
 * @param {string} userId - Requesting user id.
 * @param {string} newContent - New text content.
 * @returns {Promise<import('../models/Message.js').default>}
 */
export const editMessage = async (messageId, userId, newContent) => {
  const message = await Message.findById(messageId);

  if (!message) {
    throw new ApiError(404, 'Message not found');
  }

  await validateParticipant(String(message.conversationId), userId);

  if (String(message.sender) !== String(userId)) {
    throw new ApiError(403, 'You can only edit your own messages');
  }

  if (message.isDeleted) {
    throw new ApiError(400, 'Deleted messages cannot be edited');
  }

  const normalizedContent = typeof newContent === 'string' ? newContent.trim() : '';

  if (!normalizedContent) {
    throw new ApiError(400, 'New content is required');
  }

  if (normalizedContent !== message.content) {
    message.editHistory.push({
      content: message.content,
      editedAt: new Date(),
    });
    message.content = normalizedContent;
    message.isEdited = true;
    await message.save();
  }

  return Message.findById(message._id)
    .populate({ path: 'sender', select: 'name avatar' })
    .populate({ path: 'attachments', select: ATTACHMENT_POPULATE_FIELDS });
};

/**
 * Deletes a message either for the requester or for everyone.
 * @param {string} messageId - Message id.
 * @param {string} userId - Requesting user id.
 * @param {'me'|'everyone'} deleteFor - Deletion scope.
 * @returns {Promise<import('../models/Message.js').default>}
 */
export const deleteMessage = async (messageId, userId, deleteFor) => {
  const message = await Message.findById(messageId);

  if (!message) {
    throw new ApiError(404, 'Message not found');
  }

  await validateParticipant(String(message.conversationId), userId);

  if (deleteFor === 'everyone') {
    if (String(message.sender) !== String(userId)) {
      throw new ApiError(403, 'Only sender can delete message for everyone');
    }

    message.isDeleted = true;
    message.content = '';
    message.reactions = [];
    message.editHistory.push({
      content: 'deleted for everyone',
      editedAt: new Date(),
    });
  } else {
    if (!message.deletedFor.some((id) => String(id) === String(userId))) {
      message.deletedFor.push(userId);
    }
  }

  await message.save();

  return Message.findById(message._id)
    .populate({ path: 'sender', select: 'name avatar' })
    .populate({ path: 'attachments', select: ATTACHMENT_POPULATE_FIELDS });
};

/**
 * Adds or removes a reaction on a message for a user.
 * @param {string} messageId - Message id.
 * @param {string} userId - Requesting user id.
 * @param {string} emoji - Emoji to toggle.
 * @returns {Promise<import('../models/Message.js').default>}
 */
export const addReaction = async (messageId, userId, emoji) => {
  const message = await Message.findById(messageId);

  if (!message) {
    throw new ApiError(404, 'Message not found');
  }

  await validateParticipant(String(message.conversationId), userId);

  if (message.isDeleted) {
    throw new ApiError(400, 'Cannot react to deleted messages');
  }

  const normalizedEmoji = typeof emoji === 'string' ? emoji.trim() : '';

  if (!normalizedEmoji) {
    throw new ApiError(400, 'Emoji is required');
  }

  const reactionIndex = message.reactions.findIndex((reaction) => reaction.emoji === normalizedEmoji);

  if (reactionIndex === -1) {
    message.reactions.push({
      emoji: normalizedEmoji,
      users: [userId],
    });
  } else {
    const users = message.reactions[reactionIndex].users || [];
    const hasReacted = users.some((id) => String(id) === String(userId));

    if (hasReacted) {
      message.reactions[reactionIndex].users = users.filter((id) => String(id) !== String(userId));
    } else {
      message.reactions[reactionIndex].users.push(userId);
    }

    if (message.reactions[reactionIndex].users.length === 0) {
      message.reactions.splice(reactionIndex, 1);
    }
  }

  await message.save();

  return Message.findById(message._id)
    .populate({ path: 'sender', select: 'name avatar' })
    .populate({ path: 'attachments', select: ATTACHMENT_POPULATE_FIELDS });
};

/**
 * Marks all unread messages as read for a user in a conversation.
 * @param {string} conversationId - Conversation id.
 * @param {string} userId - User id.
 * @returns {Promise<{conversationId: string, readAt: string}>}
 */
export const markAsRead = async (conversationId, userId) => {
  const conversation = await validateParticipant(conversationId, userId);
  const readAt = new Date();

  await Message.updateMany(
    {
      conversationId: toObjectId(conversationId, 'conversationId'),
      'readBy.user': { $ne: toObjectId(userId, 'userId') },
      deletedFor: { $ne: toObjectId(userId, 'userId') },
    },
    {
      $push: {
        readBy: {
          user: toObjectId(userId, 'userId'),
          readAt,
        },
      },
    }
  );

  conversation.participants = conversation.participants.map((participant) => {
    if (String(participant.user) === String(userId)) {
      return {
        ...participant.toObject(),
        lastRead: readAt,
      };
    }

    return participant;
  });

  await conversation.save();

  return {
    conversationId: String(conversation._id),
    readAt: readAt.toISOString(),
  };
};

/**
 * Searches conversation messages by content.
 * @param {string} conversationId - Conversation id.
 * @param {string} query - Search query text.
 * @param {string} userId - Requesting user id.
 * @returns {Promise<import('../models/Message.js').default[]>}
 */
export const searchMessages = async (conversationId, query, userId) => {
  await validateParticipant(conversationId, userId);

  const normalizedQuery = typeof query === 'string' ? query.trim() : '';

  if (!normalizedQuery) {
    throw new ApiError(400, 'Search query is required');
  }

  const regex = new RegExp(escapeRegex(normalizedQuery), 'i');

  return Message.find({
    conversationId: toObjectId(conversationId, 'conversationId'),
    content: regex,
    isDeleted: false,
    deletedFor: { $ne: toObjectId(userId, 'userId') },
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate({ path: 'sender', select: 'name avatar' })
    .populate({ path: 'attachments', select: ATTACHMENT_POPULATE_FIELDS });
};
