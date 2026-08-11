import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import { useChat } from '../../context/ChatContext';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGES_PER_MESSAGE, MAX_IMAGE_SIZE_BYTES } from '../../utils/attachments';

const TYPING_STOP_DELAY_MS = 2000;

const MessageComposer = ({ conversationId }) => {
  const { sendMessage, startTyping, stopTyping } = useChat();
  const [content, setContent] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [sending, setSending] = useState(false);
  const stopTypingTimeout = useRef(null);
  const fileInputRef = useRef(null);

  const previews = useMemo(
    () => selectedImages.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [selectedImages]
  );

  useEffect(() => {
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [previews]);

  const handleChange = (event) => {
    setContent(event.target.value);
    startTyping(conversationId);

    if (stopTypingTimeout.current) clearTimeout(stopTypingTimeout.current);
    stopTypingTimeout.current = setTimeout(() => stopTyping(conversationId), TYPING_STOP_DELAY_MS);
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    const accepted = [];

    for (const file of files) {
      if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
        toast.error(`${file.name} is not a supported image type`);
        continue;
      }

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        toast.error(`${file.name} is larger than ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`);
        continue;
      }

      accepted.push(file);
    }

    setSelectedImages((current) => {
      const combined = [...current, ...accepted];

      if (combined.length > MAX_IMAGES_PER_MESSAGE) {
        toast.error(`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message`);
        return combined.slice(0, MAX_IMAGES_PER_MESSAGE);
      }

      return combined;
    });
  };

  const removeImage = (index) => {
    setSelectedImages((current) => current.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = content.trim();
    if ((!trimmed && selectedImages.length === 0) || sending) return;

    if (stopTypingTimeout.current) clearTimeout(stopTypingTimeout.current);
    stopTyping(conversationId);

    const imagesToSend = selectedImages;

    try {
      setSending(true);
      setContent('');
      setSelectedImages([]);
      await sendMessage(conversationId, trimmed, imagesToSend);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || error.response?.data?.message || 'Could not send message');
      // Preserve what the user typed/picked so a failed send isn't lost.
      setContent(trimmed);
      setSelectedImages(imagesToSend);
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

  const canSend = (content.trim() || selectedImages.length > 0) && !sending;

  return (
    <form onSubmit={handleSubmit} className="border-t border-white/10 p-4">
      {previews.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {previews.map((preview, index) => (
            <div key={preview.url} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10">
              <img src={preview.url} alt={preview.file.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(index)}
                aria-label={`Remove ${preview.file.name}`}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/80 text-slate-200 hover:bg-rose-500"
              >
                <Icon icon="mdi:close" width={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_IMAGE_MIME_TYPES.join(',')}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || selectedImages.length >= MAX_IMAGES_PER_MESSAGE}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/5 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Attach images"
        >
          <Icon icon="mdi:image-outline" width={22} />
        </button>

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
          disabled={!canSend}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Send message"
        >
          <Icon icon={sending ? 'mdi:loading' : 'mdi:send'} className={sending ? 'animate-spin' : ''} width={20} />
        </button>
      </div>
    </form>
  );
};

export default MessageComposer;
