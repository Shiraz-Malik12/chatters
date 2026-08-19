import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import {
  deleteConversation as deleteConversationRequest,
  listConversations,
  startGroupConversation as startGroupConversationRequest,
  startPrivateConversation as startPrivateConversationRequest,
  toggleArchiveConversation as toggleArchiveConversationRequest,
  toggleMuteConversation as toggleMuteConversationRequest,
} from '../api/conversations';
import {
  deleteMessage as deleteMessageRequest,
  getMessages,
  markConversationRead,
  reactToAttachment as reactToAttachmentRequest,
  reactToMessage as reactToMessageRequest,
  sendMessage as sendMessageRequest,
  updateMessage as updateMessageRequest,
} from '../api/messages';

const ChatContext = createContext(null);

const TYPING_TIMEOUT_MS = 5000;

const sortConversations = (conversations) =>
  [...conversations].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

const upsertConversation = (conversations, next) => {
  const exists = conversations.some((conversation) => conversation._id === next._id);
  const merged = exists
    ? conversations.map((conversation) => (conversation._id === next._id ? next : conversation))
    : [...conversations, next];

  return sortConversations(merged);
};

const upsertMessage = (messages, message) => {
  const exists = messages.some((item) => item._id === message._id);

  if (exists) {
    return messages.map((item) => (item._id === message._id ? message : item));
  }

  return [...messages, message];
};

const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messagesByConversation, setMessagesByConversation] = useState({});
  const [presenceByUserId, setPresenceByUserId] = useState({});
  const [typingByConversation, setTypingByConversation] = useState({});

  const typingTimeouts = useRef({});

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setConversationsLoading(false);
      return;
    }

    setConversationsLoading(true);
    listConversations()
      .then((data) => setConversations(sortConversations(data)))
      .catch(() => setConversations([]))
      .finally(() => setConversationsLoading(false));
  }, [user]);

  const patchConversationPreview = useCallback((message) => {
    setConversations((current) =>
      sortConversations(
        current.map((conversation) =>
          conversation._id === message.conversationId
            ? { ...conversation, lastMessage: message, updatedAt: message.createdAt }
            : conversation
        )
      )
    );
  }, []);

  const clearTyping = useCallback((conversationId, userId) => {
    setTypingByConversation((current) => {
      const conversationTyping = { ...(current[conversationId] || {}) };
      delete conversationTyping[userId];
      return { ...current, [conversationId]: conversationTyping };
    });
  }, []);

  useEffect(() => {
    if (!socket) return undefined;

    const handleMessageNew = (message) => {
      setMessagesByConversation((current) => {
        const existing = current[message.conversationId];
        if (!existing) return current;
        return {
          ...current,
          [message.conversationId]: { ...existing, items: [...existing.items, message] },
        };
      });
      patchConversationPreview(message);
      clearTyping(message.conversationId, message.sender?._id || message.sender);
    };

    const handleMessageChanged = (message) => {
      // "Delete for me" (see messageController.removeMessage) adds the
      // current user's id to message.deletedFor rather than changing the
      // message's content — everyone else's copy is untouched. If it's
      // *our* id in there, the message needs to disappear from our own
      // view entirely (mirrors how getMessages already excludes it from a
      // fresh page load), not just get re-upserted with nothing visibly
      // different, which is what made "delete for me" look like a no-op.
      const deletedForMe = message.deletedFor?.some((id) => String(id) === String(user?.id));

      setMessagesByConversation((current) => {
        const existing = current[message.conversationId];
        if (!existing) return current;
        return {
          ...current,
          [message.conversationId]: {
            ...existing,
            items: deletedForMe
              ? existing.items.filter((item) => item._id !== message._id)
              : upsertMessage(existing.items, message),
          },
        };
      });
    };

    const handleConversationUpsert = (conversation) => {
      setConversations((current) => upsertConversation(current, conversation));
    };

    const handleConversationRemoved = ({ conversationId }) => {
      setConversations((current) => current.filter((conversation) => conversation._id !== conversationId));
      setActiveConversationId((current) => (current === conversationId ? null : current));
    };

    const handlePresenceUpdate = ({ userId, status, lastSeen }) => {
      setPresenceByUserId((current) => ({ ...current, [userId]: { status, lastSeen } }));
    };

    const handleTypingUpdate = ({ conversationId, userId, isTyping }) => {
      if (typingTimeouts.current[`${conversationId}:${userId}`]) {
        clearTimeout(typingTimeouts.current[`${conversationId}:${userId}`]);
      }

      if (!isTyping) {
        clearTyping(conversationId, userId);
        return;
      }

      setTypingByConversation((current) => ({
        ...current,
        [conversationId]: { ...(current[conversationId] || {}), [userId]: true },
      }));

      typingTimeouts.current[`${conversationId}:${userId}`] = setTimeout(() => {
        clearTyping(conversationId, userId);
      }, TYPING_TIMEOUT_MS);
    };

    socket.on('message:new', handleMessageNew);
    socket.on('message:updated', handleMessageChanged);
    socket.on('message:deleted', handleMessageChanged);
    socket.on('message:reaction', handleMessageChanged);
    socket.on('conversation:new', handleConversationUpsert);
    socket.on('conversation:updated', handleConversationUpsert);
    socket.on('conversation:memberAdded', handleConversationUpsert);
    socket.on('conversation:memberRemoved', handleConversationUpsert);
    socket.on('conversation:removed', handleConversationRemoved);
    socket.on('presence:update', handlePresenceUpdate);
    socket.on('typing:update', handleTypingUpdate);

    return () => {
      socket.off('message:new', handleMessageNew);
      socket.off('message:updated', handleMessageChanged);
      socket.off('message:deleted', handleMessageChanged);
      socket.off('message:reaction', handleMessageChanged);
      socket.off('conversation:new', handleConversationUpsert);
      socket.off('conversation:updated', handleConversationUpsert);
      socket.off('conversation:memberAdded', handleConversationUpsert);
      socket.off('conversation:memberRemoved', handleConversationUpsert);
      socket.off('conversation:removed', handleConversationRemoved);
      socket.off('presence:update', handlePresenceUpdate);
      socket.off('typing:update', handleTypingUpdate);
    };
  }, [socket, patchConversationPreview, clearTyping, user?.id]);

  const loadMessages = useCallback(async (conversationId) => {
    const page = await getMessages(conversationId);
    setMessagesByConversation((current) => ({
      ...current,
      [conversationId]: {
        items: [...page.messages].reverse(),
        nextCursor: page.nextCursor,
        hasNext: page.hasNext,
      },
    }));
  }, []);

  const loadMoreMessages = useCallback(async (conversationId) => {
    const existing = messagesByConversation[conversationId];
    if (!existing || !existing.hasNext) return;

    const page = await getMessages(conversationId, { cursor: existing.nextCursor });
    setMessagesByConversation((current) => ({
      ...current,
      [conversationId]: {
        items: [...[...page.messages].reverse(), ...current[conversationId].items],
        nextCursor: page.nextCursor,
        hasNext: page.hasNext,
      },
    }));
  }, [messagesByConversation]);

  const selectConversation = useCallback(
    async (conversationId) => {
      setActiveConversationId(conversationId);

      if (socket) {
        socket.emit('conversation:join', conversationId);
      }

      if (!messagesByConversation[conversationId]) {
        await loadMessages(conversationId);
      }

      markConversationRead(conversationId).catch(() => {});
    },
    [socket, messagesByConversation, loadMessages]
  );

  const sendMessage = useCallback(async (conversationId, content, images = [], videoAttachments = [], replyTo = null) => {
    await sendMessageRequest(conversationId, content, { images, videoAttachments, replyTo });
  }, []);

  const editMessage = useCallback(async (messageId, content, images = [], videoAttachments = []) => {
    await updateMessageRequest(messageId, content, { images, videoAttachments });
  }, []);

  const removeMessage = useCallback(async (messageId, deleteFor = 'me') => {
    await deleteMessageRequest(messageId, deleteFor);
  }, []);

  const reactToMessage = useCallback(async (messageId, emoji) => {
    await reactToMessageRequest(messageId, emoji);
  }, []);

  const reactToAttachment = useCallback(async (attachmentId, emoji) => {
    await reactToAttachmentRequest(attachmentId, emoji);
  }, []);

  const startTyping = useCallback(
    (conversationId) => {
      socket?.emit('typing:start', { conversationId });
    },
    [socket]
  );

  const stopTyping = useCallback(
    (conversationId) => {
      socket?.emit('typing:stop', { conversationId });
    },
    [socket]
  );

  const startPrivateConversation = useCallback(async (targetId) => {
    const conversation = await startPrivateConversationRequest(targetId);
    setConversations((current) => upsertConversation(current, conversation));
    return conversation;
  }, []);

  const startGroupConversation = useCallback(async (payload) => {
    const conversation = await startGroupConversationRequest(payload);
    setConversations((current) => upsertConversation(current, conversation));
    return conversation;
  }, []);

  const toggleMuteConversation = useCallback(async (conversationId, mute) => {
    const conversation = await toggleMuteConversationRequest(conversationId, mute);
    setConversations((current) => upsertConversation(current, conversation));
  }, []);

  const toggleArchiveConversation = useCallback(async (conversationId, archive) => {
    const conversation = await toggleArchiveConversationRequest(conversationId, archive);
    setConversations((current) => upsertConversation(current, conversation));
  }, []);

  const deleteConversation = useCallback(async (conversationId) => {
    await deleteConversationRequest(conversationId);
    setConversations((current) => current.filter((conversation) => conversation._id !== conversationId));
    setActiveConversationId((current) => (current === conversationId ? null : current));
  }, []);

  const closeConversation = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  const value = {
    conversations,
    conversationsLoading,
    activeConversationId,
    messagesByConversation,
    presenceByUserId,
    typingByConversation,
    selectConversation,
    closeConversation,
    loadMoreMessages,
    sendMessage,
    editMessage,
    removeMessage,
    reactToMessage,
    reactToAttachment,
    startTyping,
    stopTyping,
    startPrivateConversation,
    startGroupConversation,
    toggleMuteConversation,
    toggleArchiveConversation,
    deleteConversation,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

const useChat = () => {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error('useChat must be used inside ChatProvider');
  }

  return context;
};

export { ChatProvider, useChat };
