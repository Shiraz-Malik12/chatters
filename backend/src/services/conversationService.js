import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';

const conversationPopulate = [
  {
    path: 'participants.user',
    select: 'name avatar status',
  },
  {
    path: 'lastMessage',
    select: 'content type sender createdAt isDeleted',
    populate: {
      path: 'sender',
      select: 'name avatar',
    },
  },
];

/**
 * Converts a value to ObjectId and validates format.
 * @param {string | mongoose.Types.ObjectId} id - Value to validate.
 * @param {string} fieldName - Name used in error messages.
 * @returns {mongoose.Types.ObjectId}
 */
const toObjectId = (id, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }

  return new mongoose.Types.ObjectId(id);
};

/**
 * Checks whether two users have blocked each other.
 * @param {import('../models/User.js').default[]} users - Two user documents.
 * @returns {boolean}
 */
const isBlockedRelationship = (users) => {
  if (users.length !== 2) {
    return false;
  }

  const [a, b] = users;
  const aBlocked = (a.blockedUsers || []).some((id) => String(id) === String(b._id));
  const bBlocked = (b.blockedUsers || []).some((id) => String(id) === String(a._id));

  return aBlocked || bBlocked;
};

/**
 * Validates that a user participates in the conversation.
 * @param {string} conversationId - Conversation id.
 * @param {string} userId - User id.
 * @returns {Promise<import('../models/Conversation.js').default>}
 */
export const validateParticipant = async (conversationId, userId) => {
  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    throw new ApiError(404, 'Conversation not found');
  }

  const isParticipant = conversation.participants.some((participant) => String(participant.user) === String(userId));

  if (!isParticipant) {
    throw new ApiError(403, 'You do not have access to this conversation');
  }

  return conversation;
};

/**
 * Creates a private conversation between two users if not already existing.
 * @param {string} userId - Initiator id.
 * @param {string} targetId - Target user id.
 * @returns {Promise<import('../models/Conversation.js').default>}
 */
export const createPrivateConversation = async (userId, targetId) => {
  const initiatorId = toObjectId(userId, 'userId');
  const recipientId = toObjectId(targetId, 'targetId');

  if (String(initiatorId) === String(recipientId)) {
    throw new ApiError(400, 'Cannot create a private conversation with yourself');
  }

  const users = await User.find({ _id: { $in: [initiatorId, recipientId] } }).select('blockedUsers');

  if (users.length !== 2) {
    throw new ApiError(404, 'One or more users do not exist');
  }

  if (isBlockedRelationship(users)) {
    throw new ApiError(403, 'Blocked users cannot message each other');
  }

  const existingConversation = await Conversation.findOne({
    type: 'private',
    'participants.user': { $all: [initiatorId, recipientId] },
    $expr: { $eq: [{ $size: '$participants' }, 2] },
  }).populate(conversationPopulate);

  if (existingConversation) {
    const hadDeletedIt = existingConversation.archivedBy.some((id) => String(id) === String(initiatorId));

    if (hadDeletedIt) {
      existingConversation.archivedBy = existingConversation.archivedBy.filter(
        (id) => String(id) !== String(initiatorId)
      );
      await existingConversation.save();
    }

    return existingConversation;
  }

  const conversation = await Conversation.create({
    type: 'private',
    participants: [
      { user: initiatorId, role: 'member' },
      { user: recipientId, role: 'member' },
    ],
    createdBy: initiatorId,
  });

  return Conversation.findById(conversation._id).populate(conversationPopulate);
};

/**
 * Creates a group conversation.
 * @param {string} userId - Creator id.
 * @param {string[]} members - Array of user ids.
 * @param {string} name - Group name.
 * @param {string} [groupAvatar=''] - Optional group avatar URL.
 * @param {string} [groupDescription=''] - Optional group description.
 * @returns {Promise<import('../models/Conversation.js').default>}
 */
export const createGroupConversation = async (
  userId,
  members,
  name,
  groupAvatar = '',
  groupDescription = ''
) => {
  const creatorId = toObjectId(userId, 'userId');

  if (!name || !name.trim()) {
    throw new ApiError(400, 'Group name is required');
  }

  if (!Array.isArray(members)) {
    throw new ApiError(400, 'Members must be an array');
  }

  const memberIds = [...new Set(members.map((id) => String(toObjectId(id, 'memberId'))))];
  const participantIds = [...new Set([String(creatorId), ...memberIds])].map((id) => new mongoose.Types.ObjectId(id));

  if (participantIds.length < 3) {
    throw new ApiError(400, 'A group conversation requires at least 3 participants including creator');
  }

  const existingUsers = await User.find({ _id: { $in: participantIds } }).select('_id');

  if (existingUsers.length !== participantIds.length) {
    throw new ApiError(404, 'One or more members do not exist');
  }

  const participants = participantIds.map((id) => ({
    user: id,
    role: String(id) === String(creatorId) ? 'admin' : 'member',
  }));

  const conversation = await Conversation.create({
    type: 'group',
    participants,
    groupName: name.trim(),
    groupAvatar: groupAvatar || '',
    groupDescription: groupDescription || '',
    admins: [creatorId],
    createdBy: creatorId,
  });

  return Conversation.findById(conversation._id).populate(conversationPopulate);
};

/**
 * Returns all visible conversations for a user.
 * @param {string} userId - User id.
 * @returns {Promise<import('../models/Conversation.js').default[]>}
 */
export const getUserConversations = async (userId) => {
  const validatedUserId = toObjectId(userId, 'userId');

  return Conversation.find({
    'participants.user': validatedUserId,
    archivedBy: { $ne: validatedUserId },
  })
    .populate(conversationPopulate)
    .sort({ updatedAt: -1 });
};

/**
 * Returns a single conversation for a participant.
 * @param {string} conversationId - Conversation id.
 * @param {string} userId - Requesting user id.
 * @returns {Promise<import('../models/Conversation.js').default>}
 */
export const getConversationById = async (conversationId, userId) => {
  await validateParticipant(conversationId, userId);
  return Conversation.findById(conversationId).populate(conversationPopulate);
};

/**
 * Updates editable group fields.
 * @param {string} conversationId - Conversation id.
 * @param {string} adminId - Admin user id.
 * @param {{groupName?: string, groupAvatar?: string, groupDescription?: string}} updates - Group fields to patch.
 * @returns {Promise<import('../models/Conversation.js').default>}
 */
export const updateGroupInfo = async (conversationId, adminId, updates) => {
  const conversation = await validateParticipant(conversationId, adminId);

  if (conversation.type !== 'group') {
    throw new ApiError(400, 'Only group conversations can be updated');
  }

  const isAdmin = conversation.admins.some((id) => String(id) === String(adminId));

  if (!isAdmin) {
    throw new ApiError(403, 'Only group admins can update this conversation');
  }

  if (typeof updates.groupName === 'string' && updates.groupName.trim()) {
    conversation.groupName = updates.groupName.trim();
  }

  if (typeof updates.groupAvatar === 'string') {
    conversation.groupAvatar = updates.groupAvatar.trim();
  }

  if (typeof updates.groupDescription === 'string') {
    conversation.groupDescription = updates.groupDescription.trim();
  }

  await conversation.save();
  return Conversation.findById(conversationId).populate(conversationPopulate);
};

/**
 * Adds a member to a group conversation.
 * @param {string} conversationId - Conversation id.
 * @param {string} userId - User id to add.
 * @param {string} adminId - Acting admin id.
 * @returns {Promise<import('../models/Conversation.js').default>}
 */
export const addMember = async (conversationId, userId, adminId) => {
  const conversation = await validateParticipant(conversationId, adminId);

  if (conversation.type !== 'group') {
    throw new ApiError(400, 'Members can only be added to group conversations');
  }

  const isAdmin = conversation.admins.some((id) => String(id) === String(adminId));

  if (!isAdmin) {
    throw new ApiError(403, 'Only group admins can add members');
  }

  const memberId = toObjectId(userId, 'userId');
  const userExists = await User.exists({ _id: memberId });

  if (!userExists) {
    throw new ApiError(404, 'User to add was not found');
  }

  const alreadyParticipant = conversation.participants.some((participant) => String(participant.user) === String(memberId));

  if (alreadyParticipant) {
    return Conversation.findById(conversationId).populate(conversationPopulate);
  }

  conversation.participants.push({ user: memberId, role: 'member' });
  await conversation.save();

  return Conversation.findById(conversationId).populate(conversationPopulate);
};

/**
 * Removes a member from a group conversation.
 * @param {string} conversationId - Conversation id.
 * @param {string} userId - User id to remove.
 * @param {string} adminId - Acting admin id.
 * @returns {Promise<import('../models/Conversation.js').default>}
 */
export const removeMember = async (conversationId, userId, adminId) => {
  const conversation = await validateParticipant(conversationId, adminId);

  if (conversation.type !== 'group') {
    throw new ApiError(400, 'Members can only be removed from group conversations');
  }

  const isAdmin = conversation.admins.some((id) => String(id) === String(adminId));

  if (!isAdmin) {
    throw new ApiError(403, 'Only group admins can remove members');
  }

  const memberId = toObjectId(userId, 'userId');

  if (String(conversation.createdBy) === String(memberId)) {
    throw new ApiError(400, 'Group creator cannot be removed');
  }

  const existingParticipant = conversation.participants.some((participant) => String(participant.user) === String(memberId));

  if (!existingParticipant) {
    throw new ApiError(404, 'User is not a participant of this conversation');
  }

  conversation.participants = conversation.participants.filter((participant) => String(participant.user) !== String(memberId));
  conversation.admins = conversation.admins.filter((id) => String(id) !== String(memberId));
  conversation.mutedBy = conversation.mutedBy.filter((id) => String(id) !== String(memberId));
  conversation.archivedBy = conversation.archivedBy.filter((id) => String(id) !== String(memberId));

  await conversation.save();

  return Conversation.findById(conversationId).populate(conversationPopulate);
};

/**
 * Mutes or unmutes a conversation for a participant.
 * @param {string} conversationId - Conversation id.
 * @param {string} userId - User id.
 * @param {boolean} mute - Whether to mute.
 * @returns {Promise<import('../models/Conversation.js').default>}
 */
export const setConversationMute = async (conversationId, userId, mute) => {
  const conversation = await validateParticipant(conversationId, userId);

  const shouldMute = Boolean(mute);

  if (shouldMute) {
    if (!conversation.mutedBy.some((id) => String(id) === String(userId))) {
      conversation.mutedBy.push(userId);
    }
  } else {
    conversation.mutedBy = conversation.mutedBy.filter((id) => String(id) !== String(userId));
  }

  await conversation.save();
  return Conversation.findById(conversationId).populate(conversationPopulate);
};

/**
 * Archives or unarchives a conversation for a participant.
 * @param {string} conversationId - Conversation id.
 * @param {string} userId - User id.
 * @param {boolean} archive - Whether to archive.
 * @returns {Promise<import('../models/Conversation.js').default>}
 */
export const setConversationArchive = async (conversationId, userId, archive) => {
  const conversation = await validateParticipant(conversationId, userId);
  const shouldArchive = Boolean(archive);

  if (shouldArchive) {
    if (!conversation.archivedBy.some((id) => String(id) === String(userId))) {
      conversation.archivedBy.push(userId);
    }
  } else {
    conversation.archivedBy = conversation.archivedBy.filter((id) => String(id) !== String(userId));
  }

  await conversation.save();
  return Conversation.findById(conversationId).populate(conversationPopulate);
};

/**
 * Removes a user from a group conversation by their own choice.
 * @param {string} conversationId - Conversation id.
 * @param {string} userId - User id leaving the group.
 * @returns {Promise<import('../models/Conversation.js').default>}
 */
export const leaveGroupConversation = async (conversationId, userId) => {
  const conversation = await validateParticipant(conversationId, userId);

  if (conversation.type !== 'group') {
    throw new ApiError(400, 'Only group conversations can be left');
  }

  conversation.participants = conversation.participants.filter(
    (participant) => String(participant.user) !== String(userId)
  );
  conversation.admins = conversation.admins.filter((id) => String(id) !== String(userId));
  conversation.mutedBy = conversation.mutedBy.filter((id) => String(id) !== String(userId));
  conversation.archivedBy = conversation.archivedBy.filter((id) => String(id) !== String(userId));

  await conversation.save();
  return Conversation.findById(conversationId).populate(conversationPopulate);
};

/**
 * Deletes a conversation from a user's own view. For a private conversation this
 * hides it from just that user (the other participant keeps it, unaffected). For a
 * group conversation there's no concept of hiding it while still being a member, so
 * this makes the user leave the group instead.
 * @param {string} conversationId - Conversation id.
 * @param {string} userId - Requesting user id.
 * @returns {Promise<{type: 'private' | 'group', conversation: import('../models/Conversation.js').default | null}>}
 */
export const deleteConversationForUser = async (conversationId, userId) => {
  const conversation = await validateParticipant(conversationId, userId);

  if (conversation.type === 'group') {
    const updated = await leaveGroupConversation(conversationId, userId);
    return { type: 'group', conversation: updated };
  }

  await setConversationArchive(conversationId, userId, true);
  return { type: 'private', conversation: null };
};
