import { useState } from 'react';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { getConversationDisplay } from '../../utils/conversation';
import Avatar from './Avatar';

const formatPreviewTime = (isoDate) => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  return isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const getPreviewText = (conversation) => {
  const message = conversation.lastMessage;
  if (!message) return 'No messages yet';
  if (message.isDeleted) return 'This message was deleted';
  return message.type === 'text' ? message.content : `Sent a ${message.type}`;
};

const ConversationListItem = ({ conversation, isActive, onSelect }) => {
  const { user } = useAuth();
  const { presenceByUserId, deleteConversation } = useChat();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { name, avatar, otherParticipant } = getConversationDisplay(conversation, user?.id);
  const liveStatus = otherParticipant ? presenceByUserId[otherParticipant._id]?.status : null;
  const isOnline = conversation.type === 'private' && (liveStatus || otherParticipant?.status) === 'online';
  const isGroup = conversation.type === 'group';

  const handleDelete = async (event) => {
    event.stopPropagation();

    try {
      setDeleting(true);
      await deleteConversation(conversation._id);
      toast.success(isGroup ? 'You left the group' : 'Chat deleted');
    } catch (error) {
      toast.error(error.response?.data?.error?.message || (isGroup ? 'Could not leave group' : 'Could not delete chat'));
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <div
      className={`group flex w-full items-center gap-2 rounded-2xl px-3 py-3 transition ${
        isActive ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
    >
      <button type="button" onClick={() => onSelect(conversation._id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar name={name} src={avatar} online={isOnline} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-100">{name}</span>
            <span className="shrink-0 text-xs text-slate-400">{formatPreviewTime(conversation.lastMessage?.createdAt)}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-400">{getPreviewText(conversation)}</span>
        </span>
      </button>

      {confirmingDelete ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          <button type="button" disabled={deleting} onClick={handleDelete} className="font-semibold text-rose-400 hover:text-rose-300">
            {isGroup ? 'Leave' : 'Delete'}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setConfirmingDelete(false);
            }}
            className="text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setConfirmingDelete(true);
          }}
          className="hidden shrink-0 text-slate-500 hover:text-rose-400 group-hover:block"
          aria-label={isGroup ? 'Leave group' : 'Delete chat'}
          title={isGroup ? 'Leave group' : 'Delete chat'}
        >
          <Icon icon={isGroup ? 'mdi:exit-to-app' : 'mdi:trash-can-outline'} width={18} />
        </button>
      )}
    </div>
  );
};

export default ConversationListItem;
