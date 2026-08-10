import { useEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { getConversationDisplay } from '../../utils/conversation';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';

const formatLastSeen = (status, lastSeen) => {
  if (status === 'online') return 'Online';
  if (!lastSeen) return 'Offline';
  return `Last seen ${new Date(lastSeen).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}`;
};

const ChatWindow = ({ conversation }) => {
  const { user } = useAuth();
  const { messagesByConversation, presenceByUserId, typingByConversation, loadMoreMessages, closeConversation } = useChat();
  const scrollRef = useRef(null);

  const conversationData = messagesByConversation[conversation._id];
  const messages = conversationData?.items || [];
  const { name, avatar, otherParticipant } = getConversationDisplay(conversation, user?.id);

  const liveStatus = otherParticipant ? presenceByUserId[otherParticipant._id] : null;
  const status = liveStatus?.status || otherParticipant?.status;
  const lastSeen = liveStatus?.lastSeen || otherParticipant?.lastSeen;

  const typingUserIds = Object.keys(typingByConversation[conversation._id] || {}).filter(
    (id) => id !== String(user?.id)
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleScroll = (event) => {
    if (event.target.scrollTop === 0 && conversationData?.hasNext) {
      loadMoreMessages(conversation._id);
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <button type="button" onClick={closeConversation} className="text-slate-400 hover:text-white md:hidden">
          <Icon icon="mdi:arrow-left" width={22} />
        </button>
        <Avatar name={name} src={avatar} online={conversation.type === 'private' && status === 'online'} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <p className="truncate text-xs text-slate-400">
            {conversation.type === 'private' ? formatLastSeen(status, lastSeen) : `${conversation.participants.length} members`}
          </p>
        </div>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {conversationData?.hasNext ? (
          <p className="pb-2 text-center text-xs text-slate-500">Scroll up to load older messages</p>
        ) : null}

        {messages.map((message, index) => {
          const previousMessage = messages[index - 1];
          const senderId = String(message.sender?._id || message.sender);
          const showSenderName =
            conversation.type === 'group' &&
            (!previousMessage || String(previousMessage.sender?._id || previousMessage.sender) !== senderId);

          return <MessageBubble key={message._id} message={message} showSenderName={showSenderName} />;
        })}

        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Say hello to start the conversation.</p>
        ) : null}
      </div>

      {typingUserIds.length > 0 ? (
        <p className="px-5 pb-1 text-xs italic text-slate-400">
          {conversation.type === 'group' ? 'Someone is typing...' : `${name} is typing...`}
        </p>
      ) : null}

      <MessageComposer conversationId={conversation._id} />
    </div>
  );
};

export default ChatWindow;
