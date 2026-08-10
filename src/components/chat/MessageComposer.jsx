import { useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import { useChat } from '../../context/ChatContext';

const TYPING_STOP_DELAY_MS = 2000;

const MessageComposer = ({ conversationId }) => {
  const { sendMessage, startTyping, stopTyping } = useChat();
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const stopTypingTimeout = useRef(null);

  const handleChange = (event) => {
    setContent(event.target.value);
    startTyping(conversationId);

    if (stopTypingTimeout.current) clearTimeout(stopTypingTimeout.current);
    stopTypingTimeout.current = setTimeout(() => stopTyping(conversationId), TYPING_STOP_DELAY_MS);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || sending) return;

    if (stopTypingTimeout.current) clearTimeout(stopTypingTimeout.current);
    stopTyping(conversationId);

    try {
      setSending(true);
      setContent('');
      await sendMessage(conversationId, trimmed);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Could not send message');
      setContent(trimmed);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-white/10 p-4">
      <textarea
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder="Type a message..."
        className="max-h-32 flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400"
      />
      <button
        type="submit"
        disabled={!content.trim() || sending}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Send message"
      >
        <Icon icon="mdi:send" width={20} />
      </button>
    </form>
  );
};

export default MessageComposer;
