import asyncHandler from '../middleware/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import {
  emitToConversation,
  emitToUser,
  joinUserToConversation,
  leaveUserFromConversation,
} from '../sockets/index.js';
import {
  addMember,
  createGroupConversation,
  createPrivateConversation,
  deleteConversationForUser,
  getConversationById,
  getUserConversations,
  removeMember,
  setConversationArchive,
  setConversationMute,
  updateGroupInfo,
} from '../services/conversationService.js';

/**
 * Notifies every other participant of a conversation that it's new to them:
 * joins their live sockets to the room and pushes it into their conversation list.
 * @param {import('socket.io').Server | null} io - Socket.IO server instance, if running.
 * @param {import('../services/conversationService.js').Conversation} conversation - Created conversation.
 * @param {string} creatorId - Id of the user who created the conversation.
 * @returns {Promise<void>}
 */
const notifyOtherParticipants = async (io, conversation, creatorId) => {
  if (!io) return;

  const otherParticipantIds = conversation.participants
    .map((participant) => String(participant.user?._id || participant.user))
    .filter((participantId) => participantId !== String(creatorId));

  await Promise.all(
    otherParticipantIds.map(async (participantId) => {
      await joinUserToConversation(io, participantId, conversation._id);
      emitToUser(io, participantId, 'conversation:new', conversation);
    })
  );
};

/**
 * Lists all conversations for current user.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const listConversations = asyncHandler(async (req, res) => {
  const conversations = await getUserConversations(String(req.user.id));
  res.status(200).json(ApiResponse.success(conversations, 'Conversations fetched successfully'));
});

/**
 * Creates either a private or group conversation.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const createConversation = asyncHandler(async (req, res) => {
  const { type = 'private', targetId, members = [], name, groupAvatar = '', groupDescription = '' } = req.body;
  const userId = String(req.user.id);

  if (type === 'private') {
    if (!targetId) {
      throw new ApiError(400, 'targetId is required for private conversation');
    }

    const conversation = await createPrivateConversation(userId, String(targetId));
    await notifyOtherParticipants(req.app.get('io'), conversation, userId);
    res.status(201).json(ApiResponse.success(conversation, 'Private conversation ready'));
    return;
  }

  if (type === 'group') {
    const conversation = await createGroupConversation(
      userId,
      Array.isArray(members) ? members.map((member) => String(member)) : [],
      name,
      groupAvatar,
      groupDescription
    );

    await notifyOtherParticipants(req.app.get('io'), conversation, userId);
    res.status(201).json(ApiResponse.success(conversation, 'Group conversation created'));
    return;
  }

  throw new ApiError(400, 'Invalid conversation type');
});

/**
 * Gets a single conversation by id for current participant.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getConversation = asyncHandler(async (req, res) => {
  const conversation = await getConversationById(req.params.id, String(req.user.id));
  res.status(200).json(ApiResponse.success(conversation, 'Conversation fetched successfully'));
});

/**
 * Updates group information.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateConversation = asyncHandler(async (req, res) => {
  const { groupName, groupAvatar, groupDescription } = req.body;

  const conversation = await updateGroupInfo(req.params.id, String(req.user.id), {
    groupName,
    groupAvatar,
    groupDescription,
  });

  const io = req.app.get('io');
  if (io) emitToConversation(io, req.params.id, 'conversation:updated', conversation);

  res.status(200).json(ApiResponse.success(conversation, 'Conversation updated successfully'));
});

/**
 * Adds member to group conversation.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const addConversationMember = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    throw new ApiError(400, 'userId is required');
  }

  const conversation = await addMember(req.params.id, String(userId), String(req.user.id));

  const io = req.app.get('io');
  if (io) {
    await joinUserToConversation(io, String(userId), req.params.id);
    emitToConversation(io, req.params.id, 'conversation:memberAdded', conversation);
    emitToUser(io, String(userId), 'conversation:new', conversation);
  }

  res.status(200).json(ApiResponse.success(conversation, 'Member added successfully'));
});

/**
 * Removes member from group conversation.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const removeConversationMember = asyncHandler(async (req, res) => {
  const conversation = await removeMember(req.params.id, req.params.userId, String(req.user.id));

  const io = req.app.get('io');
  if (io) {
    emitToConversation(io, req.params.id, 'conversation:memberRemoved', conversation);
    emitToUser(io, String(req.params.userId), 'conversation:removed', { conversationId: req.params.id });
    await leaveUserFromConversation(io, String(req.params.userId), req.params.id);
  }

  res.status(200).json(ApiResponse.success(conversation, 'Member removed successfully'));
});

/**
 * Deletes a conversation from the current user's own view (leaves the group, for groups).
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const deleteConversation = asyncHandler(async (req, res) => {
  const userId = String(req.user.id);
  const result = await deleteConversationForUser(req.params.id, userId);

  const io = req.app.get('io');

  if (io) {
    if (result.type === 'group' && result.conversation) {
      emitToConversation(io, req.params.id, 'conversation:memberRemoved', result.conversation);
    }

    emitToUser(io, userId, 'conversation:removed', { conversationId: req.params.id });
    await leaveUserFromConversation(io, userId, req.params.id);
  }

  res.status(200).json(
    ApiResponse.success(null, result.type === 'group' ? 'Left group successfully' : 'Chat deleted successfully')
  );
});

/**
 * Mutes or unmutes conversation for current user.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const toggleMuteConversation = asyncHandler(async (req, res) => {
  const { mute } = req.body;
  const conversation = await setConversationMute(req.params.id, String(req.user.id), Boolean(mute));

  const io = req.app.get('io');
  if (io) emitToUser(io, String(req.user.id), 'conversation:updated', conversation);

  res.status(200).json(
    ApiResponse.success(conversation, mute ? 'Conversation muted successfully' : 'Conversation unmuted successfully')
  );
});

/**
 * Archives or unarchives conversation for current user.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const toggleArchiveConversation = asyncHandler(async (req, res) => {
  const { archive } = req.body;
  const conversation = await setConversationArchive(req.params.id, String(req.user.id), Boolean(archive));

  const io = req.app.get('io');
  if (io) emitToUser(io, String(req.user.id), 'conversation:updated', conversation);

  res.status(200).json(
    ApiResponse.success(
      conversation,
      archive ? 'Conversation archived successfully' : 'Conversation unarchived successfully'
    )
  );
});
