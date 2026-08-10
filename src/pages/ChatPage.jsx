import { Icon } from '@iconify/react';
import { Link } from 'react-router-dom';
import { useChat } from '../context/ChatContext';
import ConversationList from '../components/chat/ConversationList';
import ChatWindow from '../components/chat/ChatWindow';

const ChatPage = () => {
  const { conversations, activeConversationId } = useChat();
  const activeConversation = conversations.find((conversation) => conversation._id === activeConversationId);

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Chatters</p>
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white">
          <Icon icon="mdi:view-dashboard-outline" /> Dashboard
        </Link>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className={`w-full shrink-0 md:w-80 ${activeConversation ? 'hidden md:block' : 'block'}`}>
          <ConversationList />
        </div>

        <div className={`min-w-0 flex-1 ${activeConversation ? 'block' : 'hidden md:block'}`}>
          {activeConversation ? (
            <ChatWindow conversation={activeConversation} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Select a conversation or start a new one
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
