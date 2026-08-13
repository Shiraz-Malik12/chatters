import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import Attachment from '../models/Attachment.js';
import ApiError from '../utils/ApiError.js';
import { toggleReaction } from '../utils/reactionUtils.js';
import { validateParticipant } from './conversationService.js';
import { deleteAttachments, processAttachments } from './attachmentService.js';
import { processVideoAttachments } from './videoUploadService.js';

const ATTACHMENT_POPULATE_FIELDS =
  'type resourceType url mimetype size width height duration thumbnailUrl format originalName publicId reactions';

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
 * Sends a message to a conversation. Accepts text, image attachments, video
 * attachments, or any combination — at least one of the three is required.
 * Works identically for private and group conversations since both share
 * this one code path.
 * @param {string} conversationId - Conversation id.
 * @param {string} senderId - Sender user id.
 * @param {string} content - Message text content (may be empty if attachments are present).
 * @param {'text'|'image'|'video'|'file'|'system'} [type='text'] - Requested message type; overridden when files/videoRefs are present.
 * @param {Express.Multer.File[]} [files=[]] - Image files parsed by multer's memoryStorage, if any.
 * @param {{publicId: string}[]} [videoRefs=[]] - Already directly-uploaded video refs to verify and attach, if any.
 * @returns {Promise<import('../models/Message.js').default>}
 */
export const sendMessage = async (conversationId, senderId, content, type = 'text', files = [], videoRefs = []) => {
  const conversation = await validateParticipant(conversationId, senderId);
  await assertPrivateMessagingAllowed(conversation, senderId);

  const normalizedContent = typeof content === 'string' ? content.trim() : '';
  const hasFiles = Array.isArray(files) && files.length > 0;
  const hasVideoRefs = Array.isArray(videoRefs) && videoRefs.length > 0;

  if (!normalizedContent && !hasFiles && !hasVideoRefs) {
    throw new ApiError(400, 'Message must contain text or at least one attachment');
  }

  // Images are validated, uploaded to Cloudinary, and persisted as Attachment
  // docs before the Message is created — never after, and never before the
  // membership check above, so an unauthorized caller can't trigger uploads.
  const imageAttachments = await processAttachments(files, senderId);

  let videoAttachments = [];

  try {
    // Videos were already uploaded directly to Cloudinary by the browser —
    // this step only *verifies* the client-supplied refs (see
    // videoUploadService.processVideoAttachments) and persists Attachment
    // docs for the ones that check out.
    videoAttachments = await processVideoAttachments(videoRefs, senderId, String(conversation._id));
  } catch (error) {
    // Roll back any images already uploaded in this same request before
    // rethrowing, so a failed video verification never leaves half a
    // message's attachments dangling.
    await deleteAttachments(imageAttachments);
    throw error;
  }

  const attachments = [...imageAttachments, ...videoAttachments];
  const normalizedType = hasVideoRefs ? 'video' : hasFiles ? 'image' : type || 'text';

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
 * Edits a message authored by the requesting user. Text content can be
 * changed as before; if `files` are provided, the message's *image*
 * attachments are replaced by them (upload-new-then-delete-old, never
 * partial — see the full-replace note in MessageComposer/MessageBubble).
 * Video attachments are not editable yet — if the message also has videos,
 * they are always left completely untouched, whether or not its images are
 * being replaced.
 * @param {string} messageId - Message id.
 * @param {string} userId - Requesting user id.
 * @param {string} newContent - New text content.
 * @param {Express.Multer.File[]} [files=[]] - Replacement image files, if the images are being changed.
 * @returns {Promise<import('../models/Message.js').default>}
 */
export const editMessage = async (messageId, userId, newContent, files = []) => {
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
  const hasNewImages = Array.isArray(files) && files.length > 0;

  // Editing only ever replaces *images* (see MessageBubble's edit UI) — any
  // video attachments on this message must survive untouched either way.
  // Split the existing set up front so a video-carrying message can still
  // have its images swapped without its videos being collected as "old"
  // attachments and deleted below.
  const existingAttachments =
    message.attachments.length > 0 ? await Attachment.find({ _id: { $in: message.attachments } }) : [];
  const existingImageAttachments = existingAttachments.filter((attachment) => attachment.type !== 'video');
  const preservedAttachments = existingAttachments.filter((attachment) => attachment.type === 'video');

  const willHaveAttachments = hasNewImages || existingAttachments.length > 0;

  if (!normalizedContent && !willHaveAttachments) {
    throw new ApiError(400, 'Message must contain text or at least one attachment');
  }

  const contentChanged = normalizedContent !== message.content;

  if (!contentChanged && !hasNewImages) {
    // Nothing actually changed — return as-is instead of bumping isEdited.
    return Message.findById(message._id)
      .populate({ path: 'sender', select: 'name avatar' })
      .populate({ path: 'attachments', select: ATTACHMENT_POPULATE_FIELDS });
  }

  // Upload replacement images (if any) *before* touching the message, so a
  // failed upload leaves the existing message and its current images
  // completely untouched.
  const newImageAttachments = hasNewImages ? await processAttachments(files, userId) : [];

  if (contentChanged) {
    message.editHistory.push({
      content: message.content,
      editedAt: new Date(),
    });
    message.content = normalizedContent;
  }

  if (hasNewImages) {
    // Preserved (video) attachments come first, followed by the replacement
    // images — the old *image* attachments are dropped from the message
    // here and physically deleted below, once the save succeeds.
    message.attachments = [
      ...preservedAttachments.map((attachment) => attachment._id),
      ...newImageAttachments.map((attachment) => attachment._id),
    ];
    message.type = preservedAttachments.some((attachment) => attachment.type === 'video') ? message.type : 'image';
  }

  message.isEdited = true;

  try {
    await message.save();
  } catch (error) {
    // The message never switched over, so roll back the freshly uploaded
    // replacement images before rethrowing — nothing should point at them.
    await deleteAttachments(newImageAttachments);
    throw error;
  }

  // Only delete the old *images* once the message safely points at the new
  // ones — otherwise a race could leave a message referencing nothing. The
  // preserved video attachments were never touched, so there's nothing to
  // clean up for them.
  if (hasNewImages) {
    await deleteAttachments(existingImageAttachments);
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
 * Adds or removes a reaction on a message for a user. In private (1:1)
 * conversations each person may only have one active emoji at a time on a
 * given message — picking a new one swaps out their previous reaction. Group
 * conversations keep the original behavior of allowing a user to stack
 * multiple different emoji reactions. See utils/reactionUtils.js.
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

  const conversation = await validateParticipant(String(message.conversationId), userId);

  if (message.isDeleted) {
    throw new ApiError(400, 'Cannot react to deleted messages');
  }

  const normalizedEmoji = typeof emoji === 'string' ? emoji.trim() : '';

  if (!normalizedEmoji) {
    throw new ApiError(400, 'Emoji is required');
  }

  message.reactions = toggleReaction(message.reactions, userId, normalizedEmoji, {
    exclusive: conversation.type === 'private',
  });

  await message.save();

  return Message.findById(message._id)
    .populate({ path: 'sender', select: 'name avatar' })
    .populate({ path: 'attachments', select: ATTACHMENT_POPULATE_FIELDS });
};

/**
 * Adds or removes a reaction on one specific image attachment (rather than
 * the whole message) — lets each picture in a multi-image message carry its
 * own reactions. Same private-1:1-exclusivity rule as addReaction applies,
 * based on the conversation the attachment's message belongs to.
 * @param {string} attachmentId - Attachment id.
 * @param {string} userId - Requesting user id.
 * @param {string} emoji - Emoji to toggle.
 * @returns {Promise<import('../models/Message.js').default>} The parent message, repopulated.
 */
export const addAttachmentReaction = async (attachmentId, userId, emoji) => {
  const attachment = await Attachment.findById(attachmentId);

  if (!attachment) {
    throw new ApiError(404, 'Attachment not found');
  }

  // Attachments don't store a back-reference to their message, so we look up
  // the (one) message that references this attachment id.
  const message = await Message.findOne({ attachments: attachment._id });

  if (!message) {
    throw new ApiError(404, 'Attachment is not linked to any message');
  }

  const conversation = await validateParticipant(String(message.conversationId), userId);

  if (message.isDeleted) {
    throw new ApiError(400, 'Cannot react to a deleted message');
  }

  const normalizedEmoji = typeof emoji === 'string' ? emoji.trim() : '';

  if (!normalizedEmoji) {
    throw new ApiError(400, 'Emoji is required');
  }

  attachment.reactions = toggleReaction(attachment.reactions, userId, normalizedEmoji, {
    exclusive: conversation.type === 'private',
  });

  await attachment.save();

  return Message.findById(message._id)
    .populate({ path: 'sender', select: 'name avatar' })
    .populate({ path: 'attachments', select: ATTACHMENT_POPULATE_FIELDS })
    .populate({ path: 'replyTo', select: 'sender content type createdAt isDeleted' });
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
