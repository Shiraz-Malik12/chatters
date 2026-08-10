import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useChat } from '../../context/ChatContext';
import ConversationListItem from './ConversationListItem';
import NewConversationModal from './NewConversationModal';

const ConversationList = () => {
  const { conversations, conversationsLoading, activeConversationId, selectConversation } = useChat();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="flex h-full w-full flex-col border-r border-white/10">
      <div className="flex items-center justify-between px-4 py-4">
        <h2 className="text-lg font-bold text-white">Chats</h2>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950 transition hover:brightness-110"
          aria-label="Start new conversation"
        >
          <Icon icon="mdi:plus" width={20} />
        </button>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {conversationsLoading ? (
          <p className="px-3 py-6 text-center text-sm text-slate-400">Loading conversations...</p>
        ) : null}

        {!conversationsLoading && conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-slate-400">
            No conversations yet. Start one with the + button.
          </p>
        ) : null}

        {conversations.map((conversation) => (
          <ConversationListItem
            key={conversation._id}
            conversation={conversation}
            isActive={conversation._id === activeConversationId}
            onSelect={selectConversation}
          />
        ))}
      </div>

      {isModalOpen ? <NewConversationModal onClose={() => setIsModalOpen(false)} /> : null}
    </div>
  );
};

export default ConversationList;
