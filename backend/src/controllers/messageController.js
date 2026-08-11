import asyncHandler from '../middleware/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { emitToConversation } from '../sockets/index.js';
import {
  addReaction,
  deleteMessage,
  editMessage,
  getMessages,
  markAsRead,
  searchMessages,
  sendMessage,
} from '../services/messageService.js';

/**
 * Sends a message in a conversation.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const createMessage = asyncHandler(async (req, res) => {
  const { content = '', type = 'text' } = req.body;
  const files = req.files || [];
  const message = await sendMessage(req.params.id, String(req.user.id), content, type, files);

  const io = req.app.get('io');
  if (io) {
    try {
      emitToConversation(io, req.params.id, 'message:new', message);
    } catch (error) {
      // MongoDB is the source of truth — the message is already saved, so a
      // broadcast failure must not fail the request or delete the message.
      console.error('[messages] failed to emit message:new:', error.message);
    }
  }

  res.status(201).json(ApiResponse.success(message, 'Message sent successfully'));
});

/**
 * Gets cursor-paginated messages for a conversation.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getConversationMessages = asyncHandler(async (req, res) => {
  const { cursor, limit } = req.query;

  const result = await getMessages(req.params.id, cursor, Number(limit) || 20, String(req.user.id));

  res.status(200).json(ApiResponse.success(result, 'Messages fetched successfully'));
});

/**
 * Edits an existing message authored by user.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const updateMessage = asyncHandler(async (req, res) => {
  const { content } = req.body;

  if (typeof content !== 'string') {
    throw new ApiError(400, 'content is required');
  }

  const message = await editMessage(req.params.id, String(req.user.id), content);

  const io = req.app.get('io');
  if (io) emitToConversation(io, String(message.conversationId), 'message:updated', message);

  res.status(200).json(ApiResponse.success(message, 'Message updated successfully'));
});

/**
 * Deletes a message for requester or everyone.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const removeMessage = asyncHandler(async (req, res) => {
  const deleteFor = req.body.deleteFor === 'everyone' ? 'everyone' : 'me';
  const message = await deleteMessage(req.params.id, String(req.user.id), deleteFor);

  const io = req.app.get('io');
  if (io) emitToConversation(io, String(message.conversationId), 'message:deleted', message);

  res.status(200).json(ApiResponse.success(message, 'Message deleted successfully'));
});

/**
 * Adds or removes message reaction for current user.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const reactToMessage = asyncHandler(async (req, res) => {
  const { emoji } = req.body;

  if (!emoji) {
    throw new ApiError(400, 'emoji is required');
  }

  const message = await addReaction(req.params.id, String(req.user.id), String(emoji));

  const io = req.app.get('io');
  if (io) emitToConversation(io, String(message.conversationId), 'message:reaction', message);

  res.status(200).json(ApiResponse.success(message, 'Reaction updated successfully'));
});

/**
 * Marks all unread messages as read in a conversation.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const markConversationRead = asyncHandler(async (req, res) => {
  const result = await markAsRead(req.params.id, String(req.user.id));

  const io = req.app.get('io');
  if (io) emitToConversation(io, req.params.id, 'conversation:read', { ...result, userId: String(req.user.id) });

  res.status(200).json(ApiResponse.success(result, 'Conversation marked as read'));
});

/**
 * Searches messages within a conversation.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const searchConversationMessages = asyncHandler(async (req, res) => {
  const conversationId = String(req.query.conversationId || '');
  const query = String(req.query.query || req.query.q || '');

  if (!conversationId) {
    throw new ApiError(400, 'conversationId query param is required');
  }

  const messages = await searchMessages(conversationId, query, String(req.user.id));
  res.status(200).json(ApiResponse.success(messages, 'Messages search completed'));
});
