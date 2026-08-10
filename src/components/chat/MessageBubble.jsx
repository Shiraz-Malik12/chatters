import { useState } from 'react';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

const formatTime = (isoDate) => new Date(isoDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const MessageBubble = ({ message, showSenderName }) => {
  const { user } = useAuth();
  const { editMessage, removeMessage, reactToMessage } = useChat();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const isOwn = String(message.sender?._id || message.sender) === String(user?.id);

  if (message.isDeleted) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <p className="max-w-xs rounded-2xl border border-white/10 px-4 py-2 text-xs italic text-slate-500">
          This message was deleted
        </p>
      </div>
    );
  }

  const handleSaveEdit = async () => {
    if (!draft.trim()) return;

    try {
      await editMessage(message._id, draft.trim());
      setIsEditing(false);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Could not edit message');
    }
  };

  const handleDelete = async (deleteFor) => {
    try {
      await removeMessage(message._id, deleteFor);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Could not delete message');
    } finally {
      setConfirmingDelete(false);
    }
  };

  const handleReact = async (emoji) => {
    setShowReactionPicker(false);
    try {
      await reactToMessage(message._id, emoji);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Could not react to message');
    }
  };

  return (
    <div className={`group flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
      {showSenderName && !isOwn ? (
        <span className="mb-1 px-1 text-xs font-medium text-slate-400">{message.sender?.name}</span>
      ) : null}

      <div className="flex items-center gap-1">
        {isOwn ? (
          <span className="hidden items-center gap-1 group-hover:flex">
            <button type="button" onClick={() => setIsEditing((current) => !current)} className="text-slate-500 hover:text-slate-200">
              <Icon icon="mdi:pencil-outline" width={16} />
            </button>
            <button type="button" onClick={() => setConfirmingDelete((current) => !current)} className="text-slate-500 hover:text-rose-400">
              <Icon icon="mdi:trash-can-outline" width={16} />
            </button>
          </span>
        ) : null}

        <div
          className={`max-w-xs rounded-2xl px-4 py-2 text-sm sm:max-w-sm ${
            isOwn ? 'bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950' : 'bg-white/10 text-slate-100'
          }`}
        >
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                className="w-full rounded-xl bg-slate-950/40 p-2 text-sm text-slate-100 outline-none"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
              />
              <div className="flex justify-end gap-2 text-xs">
                <button type="button" onClick={() => setIsEditing(false)} className="text-slate-300">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveEdit} className="font-semibold text-slate-950">
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>

        <span className="hidden group-hover:flex">
          <button type="button" onClick={() => setShowReactionPicker((current) => !current)} className="text-slate-500 hover:text-slate-200">
            <Icon icon="mdi:emoticon-outline" width={16} />
          </button>
        </span>
      </div>

      {showReactionPicker ? (
        <div className="mt-1 flex gap-1 rounded-full bg-white/10 px-2 py-1">
          {QUICK_REACTIONS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => handleReact(emoji)} className="text-sm hover:scale-110">
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {message.reactions?.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {message.reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              onClick={() => handleReact(reaction.emoji)}
              className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-200"
            >
              {reaction.emoji} {reaction.users.length}
            </button>
          ))}
        </div>
      ) : null}

      {confirmingDelete ? (
        <div className="mt-1 flex gap-2 text-xs text-slate-300">
          <button type="button" onClick={() => handleDelete('me')} className="underline">
            Delete for me
          </button>
          <button type="button" onClick={() => handleDelete('everyone')} className="text-rose-400 underline">
            Delete for everyone
          </button>
          <button type="button" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </button>
        </div>
      ) : null}

      <span className="mt-1 px-1 text-[11px] text-slate-500">
        {formatTime(message.createdAt)}
        {message.isEdited ? ' · edited' : ''}
      </span>
    </div>
  );
};

export default MessageBubble;
