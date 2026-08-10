import { Server } from 'socket.io';
import { parseCookie } from 'cookie';
import allowedOrigins from '../config/cors.js';
import { verifyAccessToken } from '../services/token.service.js';
import User from '../models/User.js';
import { validateParticipant, getUserConversations } from '../services/conversationService.js';

let ioInstance = null;

const getUserRoom = (userId) => `user:${userId}`;
const getConversationRoom = (conversationId) => `conversation:${conversationId}`;

/**
 * Authenticates a socket handshake using the same accessToken cookie as the REST API.
 * @param {import('socket.io').Socket} socket - Connecting socket.
 * @param {(error?: Error) => void} next - Socket.IO middleware callback.
 * @returns {Promise<void>}
 */
const authenticateSocket = async (socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = cookieHeader ? parseCookie(cookieHeader) : {};
    const token = cookies.accessToken;

    if (!token) {
      throw new Error('Authentication required');
    }

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.sub);

    if (!user) {
      throw new Error('User no longer exists');
    }

    socket.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    console.error('[socket] authentication failed:', error.message);
    next(new Error('Unauthorized'));
  }
};

/**
 * Joins a socket to its personal room and every conversation room it belongs to.
 * @param {import('socket.io').Socket} socket - Connected socket.
 * @returns {Promise<void>}
 */
const joinInitialRooms = async (socket) => {
  const userId = socket.user.id;
  socket.join(getUserRoom(userId));

  await User.findByIdAndUpdate(userId, { status: 'online' });

  const conversations = await getUserConversations(userId);
  conversations.forEach((conversation) => {
    const room = getConversationRoom(conversation._id);
    socket.join(room);
    socket.to(room).emit('presence:update', { userId, status: 'online' });
  });
};

/**
 * Handles a user going fully offline (no sockets left in their personal room).
 * @param {import('socket.io').Server} io - Socket.IO server instance.
 * @param {string} userId - Disconnected user id.
 * @returns {Promise<void>}
 */
const handleFullyOffline = async (io, userId) => {
  const remainingSockets = await io.in(getUserRoom(userId)).fetchSockets();

  if (remainingSockets.length > 0) {
    return;
  }

  const lastSeen = new Date();
  await User.findByIdAndUpdate(userId, { status: 'offline', lastSeen });

  const conversations = await getUserConversations(userId);
  conversations.forEach((conversation) => {
    io.to(getConversationRoom(conversation._id)).emit('presence:update', {
      userId,
      status: 'offline',
      lastSeen,
    });
  });
};

/**
 * Registers all event handlers for a newly connected, authenticated socket.
 * @param {import('socket.io').Server} io - Socket.IO server instance.
 * @param {import('socket.io').Socket} socket - Connected socket.
 * @returns {void}
 */
const registerConnectionHandlers = (io, socket) => {
  const userId = socket.user.id;

  joinInitialRooms(socket).catch((error) => {
    console.error('[socket] failed to join initial rooms:', error.message);
  });

  socket.on('conversation:join', async (conversationId, callback) => {
    try {
      await validateParticipant(conversationId, userId);
      socket.join(getConversationRoom(conversationId));
      if (typeof callback === 'function') callback({ success: true });
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, message: error.message });
    }
  });

  socket.on('conversation:leave', (conversationId) => {
    socket.leave(getConversationRoom(conversationId));
  });

  socket.on('typing:start', ({ conversationId } = {}) => {
    if (!conversationId) return;
    socket.to(getConversationRoom(conversationId)).emit('typing:update', {
      conversationId,
      userId,
      isTyping: true,
    });
  });

  socket.on('typing:stop', ({ conversationId } = {}) => {
    if (!conversationId) return;
    socket.to(getConversationRoom(conversationId)).emit('typing:update', {
      conversationId,
      userId,
      isTyping: false,
    });
  });

  socket.on('disconnect', () => {
    handleFullyOffline(io, userId).catch((error) => {
      console.error('[socket] failed to process disconnect:', error.message);
    });
  });
};

/**
 * Initializes the Socket.IO server on top of the shared HTTP server.
 * @param {import('http').Server} httpServer - Node HTTP server shared with Express.
 * @returns {import('socket.io').Server}
 */
export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error('CORS origin not allowed'));
      },
      credentials: true,
    },
  });

  io.use(authenticateSocket);
  io.on('connection', (socket) => registerConnectionHandlers(io, socket));

  ioInstance = io;
  return io;
};

/**
 * Emits an event to every socket currently in a conversation room.
 * @param {import('socket.io').Server} io - Socket.IO server instance.
 * @param {string} conversationId - Conversation id.
 * @param {string} event - Event name.
 * @param {unknown} payload - Event payload.
 * @returns {void}
 */
export const emitToConversation = (io, conversationId, event, payload) => {
  io.to(getConversationRoom(conversationId)).emit(event, payload);
};

/**
 * Emits an event to every socket a specific user currently has open.
 * @param {import('socket.io').Server} io - Socket.IO server instance.
 * @param {string} userId - Target user id.
 * @param {string} event - Event name.
 * @param {unknown} payload - Event payload.
 * @returns {void}
 */
export const emitToUser = (io, userId, event, payload) => {
  io.to(getUserRoom(userId)).emit(event, payload);
};

/**
 * Makes every open socket of a user join a conversation room server-side,
 * so newly created conversations start receiving events immediately.
 * @param {import('socket.io').Server} io - Socket.IO server instance.
 * @param {string} userId - Target user id.
 * @param {string} conversationId - Conversation id to join.
 * @returns {Promise<void>}
 */
export const joinUserToConversation = async (io, userId, conversationId) => {
  await io.in(getUserRoom(userId)).socketsJoin(getConversationRoom(conversationId));
};

/**
 * Makes every open socket of a user leave a conversation room server-side,
 * e.g. right after they've been removed from that conversation.
 * @param {import('socket.io').Server} io - Socket.IO server instance.
 * @param {string} userId - Target user id.
 * @param {string} conversationId - Conversation id to leave.
 * @returns {Promise<void>}
 */
export const leaveUserFromConversation = async (io, userId, conversationId) => {
  await io.in(getUserRoom(userId)).socketsLeave(getConversationRoom(conversationId));
};

/**
 * Returns the active Socket.IO server instance, if initialized.
 * @returns {import('socket.io').Server | null}
 */
export const getIO = () => ioInstance;
