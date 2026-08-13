import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { QUICK_REACTIONS } from '../../utils/reactions';
import { requestVideoUploadSignature, uploadVideoToCloudinary } from '../../api/media';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEOS_PER_MESSAGE,
  MAX_VIDEO_SIZE_BYTES,
  formatDuration,
} from '../../utils/attachments';
import MessageAttachments from './MessageAttachments';

const formatTime = (isoDate) => new Date(isoDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const MessageBubble = ({ message, showSenderName }) => {
  const { user } = useAuth();
  const { editMessage, removeMessage, reactToMessage } = useChat();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  // null = keep the message's existing images/videos untouched; an array
  // (even empty after removing every picked file) means "replace with this
  // set" once Save is pressed — see the full-replace note on editMessage.
  // Images and videos are tracked (and replaced) independently.
  const [editImages, setEditImages] = useState(null);
  const [editVideos, setEditVideos] = useState(null);
  // { [videoId]: percent } — only populated while that video is actively
  // uploading as part of a Save in progress.
  const [videoUploadProgress, setVideoUploadProgress] = useState({});
  const [uploadingVideos, setUploadingVideos] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const editFileInputRef = useRef(null);

  const isOwn = String(message.sender?._id || message.sender) === String(user?.id);
  const attachments = message.attachments || [];
  const imageAttachments = attachments.filter((attachment) => attachment.type !== 'video');
  const videoAttachments = attachments.filter((attachment) => attachment.type === 'video');
  const hasAttachments = attachments.length > 0;
  const hasText = Boolean(message.content?.trim());
  const busy = savingEdit || uploadingVideos;

  const editPreviews = useMemo(
    () => (editImages || []).map((file) => ({ file, url: URL.createObjectURL(file) })),
    [editImages]
  );

  useEffect(() => {
    return () => editPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [editPreviews]);

  const editVideoPreviews = useMemo(
    () => (editVideos || []).map((video) => ({ ...video, url: URL.createObjectURL(video.file) })),
    [editVideos]
  );

  useEffect(() => {
    return () => editVideoPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [editVideoPreviews]);

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

    const acceptedImages = [];
    const acceptedVideos = [];

    for (const file of files) {
      if (ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          toast.error(`${file.name} is larger than ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`);
          continue;
        }
        acceptedImages.push(file);
      } else if (ALLOWED_VIDEO_MIME_TYPES.includes(file.type)) {
        if (file.size > MAX_VIDEO_SIZE_BYTES) {
          toast.error(`${file.name} is larger than ${MAX_VIDEO_SIZE_BYTES / (1024 * 1024)}MB`);
          continue;
        }
        acceptedVideos.push({ id: `${file.name}-${file.size}-${file.lastModified}`, file });
      } else {
        toast.error(`${file.name} is not a supported image or video type`);
      }
    }

    if (acceptedImages.length > 0) {
      setEditImages((current) => {
        const combined = [...(current || []), ...acceptedImages];

        if (combined.length > MAX_IMAGES_PER_MESSAGE) {
          toast.error(`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message`);
          return combined.slice(0, MAX_IMAGES_PER_MESSAGE);
        }

        return combined;
      });
    }

    if (acceptedVideos.length > 0) {
      setEditVideos((current) => {
        const combined = [...(current || []), ...acceptedVideos];

        if (combined.length > MAX_VIDEOS_PER_MESSAGE) {
          toast.error(`You can attach up to ${MAX_VIDEOS_PER_MESSAGE} videos per message`);
          return combined.slice(0, MAX_VIDEOS_PER_MESSAGE);
        }

        return combined;
      });
    }
  };

  const removeEditImage = (index) => {
    setEditImages((current) => (current || []).filter((_, i) => i !== index));
  };

  const removeEditVideo = (id) => {
    setEditVideos((current) => (current || []).filter((video) => video.id !== id));
  };

  const undoEditAttachments = () => {
    setEditImages(null);
    setEditVideos(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setDraft(message.content);
    setEditImages(null);
    setEditVideos(null);
    setVideoUploadProgress({});
  };

  /**
   * Uploads every replacement video directly to Cloudinary, one at a time —
   * same approach (and same reasoning) as MessageComposer.uploadVideos.
   * Only called from handleSaveEdit, so nothing reaches Cloudinary before
   * Save is pressed.
   */
  const uploadEditVideos = async (videos) => {
    const refs = [];

    for (const video of videos) {
      const authorization = await requestVideoUploadSignature(message.conversationId);
      const result = await uploadVideoToCloudinary(video.file, authorization, {
        onProgress: (percent) => setVideoUploadProgress((current) => ({ ...current, [video.id]: percent })),
      });
      refs.push({ publicId: result.public_id });
    }

    return refs;
  };

  const handleSaveEdit = async () => {
    const trimmed = draft.trim();
    const willHaveAttachments = Boolean(editImages?.length) || Boolean(editVideos?.length) || hasAttachments;

    // Mirrors the backend's "must have text or at least one attachment" rule
    // — see messageService.editMessage — so we never send a request the
    // server is guaranteed to reject.
    if (!trimmed && !willHaveAttachments) return;

    setSavingEdit(true);

    try {
      let videoRefs = [];

      if (editVideos && editVideos.length > 0) {
        setUploadingVideos(true);
        videoRefs = await uploadEditVideos(editVideos);
        setUploadingVideos(false);
      }

      await editMessage(message._id, trimmed, editImages || [], videoRefs);
      setIsEditing(false);
      setEditImages(null);
      setEditVideos(null);
      setVideoUploadProgress({});
    } catch (error) {
      toast.error(error.response?.data?.error?.message || error.response?.data?.message || 'Could not edit message');
      setUploadingVideos(false);
    } finally {
      setSavingEdit(false);
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
                // A replacement image set has been picked — preview it
                // instead of the original images; nothing is uploaded until
                // Save.
                <div className="flex flex-wrap gap-2">
                  {editPreviews.map((preview, index) => (
                    <div key={preview.url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10">
                      <img src={preview.url} alt={preview.file.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeEditImage(index)}
                        disabled={busy}
                        aria-label={`Remove ${preview.file.name}`}
                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/80 text-slate-200 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Icon icon="mdi:close" width={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : imageAttachments.length > 0 ? (
                // No image replacement chosen yet — show the images as they are today.
                <div className="flex flex-wrap gap-2">
                  {imageAttachments.map((attachment) => (
                    <img
                      key={attachment._id}
                      src={attachment.url}
                      alt={attachment.originalName || 'attachment'}
                      className="h-16 w-16 rounded-xl border border-white/10 object-cover"
                    />
                  ))}
                </div>
              ) : null}

              {editVideos && editVideos.length > 0 ? (
                // A replacement video set has been picked — preview it
                // instead of the original videos; nothing is uploaded until
                // Save (see uploadEditVideos, called from handleSaveEdit).
                <div className="flex flex-wrap gap-2">
                  {editVideoPreviews.map((preview) => {
                    const progress = videoUploadProgress[preview.id];
                    const isUploading = uploadingVideos && progress !== undefined;

                    return (
                      <div key={preview.id} className="relative h-16 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                        <video src={preview.url} className="h-full w-full object-cover" muted preload="metadata" />
                        {!isUploading ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/30">
                            <Icon icon="mdi:play-circle" width={22} className="text-white/90" />
                          </div>
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-slate-950/80 text-slate-100">
                            <span className="text-xs font-semibold">{progress}%</span>
                            <span className="text-[9px] uppercase tracking-wide text-slate-300">Uploading</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeEditVideo(preview.id)}
                          disabled={busy}
                          aria-label={`Remove ${preview.file.name}`}
                          className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/80 text-slate-200 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Icon icon="mdi:close" width={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : videoAttachments.length > 0 ? (
                // No video replacement chosen yet — show the videos as they are today.
                <div className="flex flex-wrap gap-2">
                  {videoAttachments.map((attachment) => (
                    <div key={attachment._id} className="relative h-16 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                      <video
                        src={attachment.url}
                        poster={attachment.thumbnailUrl || undefined}
                        className="h-full w-full object-cover"
                        muted
                        preload="metadata"
                      />
                      {attachment.duration ? (
                        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-slate-950/80 px-1 py-0.5 text-[9px] text-slate-100">
                          {formatDuration(attachment.duration)}
                        </span>
                      ) : null}
                    </div>
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
                    accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(',')}
                    multiple
                    onChange={handleEditFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    disabled={busy}
                    className="flex items-center gap-1 text-slate-300 transition-colors duration-150 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icon icon="mdi:image-outline" width={16} />
                    {hasAttachments ? 'Replace attachments' : 'Add images or videos'}
                  </button>
                  {(editImages && editImages.length > 0) || (editVideos && editVideos.length > 0) ? (
                    <button
                      type="button"
                      onClick={undoEditAttachments}
                      disabled={busy}
                      className="text-slate-300 transition-colors duration-150 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Undo
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={handleCancelEdit} disabled={busy} className="text-slate-300 disabled:cursor-not-allowed disabled:opacity-50">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={busy}
                    className="flex items-center gap-1 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <Icon icon="mdi:loading" width={14} className="animate-spin" /> : null}
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
