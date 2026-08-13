import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { QUICK_REACTIONS } from '../../utils/reactions';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGES_PER_MESSAGE, MAX_IMAGE_SIZE_BYTES } from '../../utils/attachments';
import MessageAttachments from './MessageAttachments';

const formatTime = (isoDate) => new Date(isoDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const MessageBubble = ({ message, showSenderName }) => {
  const { user } = useAuth();
  const { editMessage, removeMessage, reactToMessage } = useChat();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  // null = keep the message's existing images untouched; an array (even
  // empty after removing every picked file) means "replace with this set"
  // once Save is pressed — see the full-replace note on editMessage.
  const [editImages, setEditImages] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const editFileInputRef = useRef(null);

  const isOwn = String(message.sender?._id || message.sender) === String(user?.id);
  const hasAttachments = Boolean(message.attachments?.length);
  const hasText = Boolean(message.content?.trim());

  const editPreviews = useMemo(
    () => (editImages || []).map((file) => ({ file, url: URL.createObjectURL(file) })),
    [editImages]
  );

  useEffect(() => {
    return () => editPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [editPreviews]);

  if (message.isDeleted) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <p className="max-w-xs rounded-2xl border border-white/10 px-4 py-2 text-xs italic text-slate-500">
          This message was deleted
        </p>
      </div>
    );
  }

  const handleEditFileSelect = (event) => {
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

    setEditImages((current) => {
      const combined = [...(current || []), ...accepted];

      if (combined.length > MAX_IMAGES_PER_MESSAGE) {
        toast.error(`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message`);
        return combined.slice(0, MAX_IMAGES_PER_MESSAGE);
      }

      return combined;
    });
  };

  const removeEditImage = (index) => {
    setEditImages((current) => (current || []).filter((_, i) => i !== index));
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setDraft(message.content);
    setEditImages(null);
  };

  const handleSaveEdit = async () => {
    const trimmed = draft.trim();
    const willHaveAttachments = Boolean(editImages?.length) || hasAttachments;

    // Mirrors the backend's "must have text or at least one image" rule —
    // see messageService.editMessage — so we never send a request the
    // server is guaranteed to reject.
    if (!trimmed && !willHaveAttachments) return;

    try {
      await editMessage(message._id, trimmed, editImages || []);
      setIsEditing(false);
      setEditImages(null);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || error.response?.data?.message || 'Could not edit message');
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
          <span className="flex items-center gap-1 opacity-0 transition-opacity duration-150 ease-out pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto">
            <button type="button" onClick={() => setIsEditing((current) => !current)} className="text-slate-500 transition-colors duration-150 hover:text-slate-200">
              <Icon icon="mdi:pencil-outline" width={16} />
            </button>
            <button type="button" onClick={() => setConfirmingDelete((current) => !current)} className="text-slate-500 transition-colors duration-150 hover:text-rose-400">
              <Icon icon="mdi:trash-can-outline" width={16} />
            </button>
          </span>
        ) : null}

        <div
          className={`max-w-xs rounded-2xl px-4 py-2 text-sm sm:max-w-sm ${hasAttachments ? 'space-y-2' : ''} ${
            isOwn ? 'bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950' : 'bg-white/10 text-slate-100'
          }`}
        >
          {isEditing ? (
            <div className="space-y-2">
              {editImages && editImages.length > 0 ? (
                // A replacement set has been picked — preview it instead of
                // the original images; nothing is uploaded until Save.
                <div className="flex flex-wrap gap-2">
                  {editPreviews.map((preview, index) => (
                    <div key={preview.url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10">
                      <img src={preview.url} alt={preview.file.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeEditImage(index)}
                        aria-label={`Remove ${preview.file.name}`}
                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/80 text-slate-200 hover:bg-rose-500"
                      >
                        <Icon icon="mdi:close" width={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : hasAttachments ? (
                // No replacement chosen yet — show the images as they are today.
                <div className="flex flex-wrap gap-2">
                  {message.attachments.map((attachment) => (
                    <img
                      key={attachment._id}
                      src={attachment.url}
                      alt={attachment.originalName || 'attachment'}
                      className="h-16 w-16 rounded-xl border border-white/10 object-cover"
                    />
                  ))}
                </div>
              ) : null}

              <textarea
                className="w-full rounded-xl bg-slate-950/40 p-2 text-sm text-slate-100 outline-none"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
              />

              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept={ALLOWED_IMAGE_MIME_TYPES.join(',')}
                    multiple
                    onChange={handleEditFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    className="flex items-center gap-1 text-slate-300 transition-colors duration-150 hover:text-slate-100"
                  >
                    <Icon icon="mdi:image-outline" width={16} />
                    {hasAttachments ? 'Replace images' : 'Add images'}
                  </button>
                  {editImages && editImages.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setEditImages(null)}
                      className="text-slate-300 transition-colors duration-150 hover:text-slate-100"
                    >
                      Undo
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleCancelEdit} className="text-slate-300">
                    Cancel
                  </button>
                  <button type="button" onClick={handleSaveEdit} className="font-semibold text-slate-950">
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {hasAttachments ? <MessageAttachments attachments={message.attachments} /> : null}
              {hasText ? <p className="whitespace-pre-wrap break-words">{message.content}</p> : null}
            </>
          )}
        </div>

        <span className="flex opacity-0 transition-opacity duration-150 ease-out pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto">
          <button type="button" onClick={() => setShowReactionPicker((current) => !current)} className="text-slate-500 transition-colors duration-150 hover:text-slate-200">
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
