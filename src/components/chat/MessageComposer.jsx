import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import { useChat } from '../../context/ChatContext';
import { requestVideoUploadSignature, uploadVideoToCloudinary } from '../../api/media';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEOS_PER_MESSAGE,
  MAX_VIDEO_SIZE_BYTES,
} from '../../utils/attachments';

const TYPING_STOP_DELAY_MS = 2000;

const MessageComposer = ({ conversationId }) => {
  const { sendMessage, startTyping, stopTyping } = useChat();
  const [content, setContent] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  // Each entry: { id, file }. Unlike images, videos aren't uploaded until
  // Send is pressed (see handleSubmit) — selecting one only stores it
  // locally, so removing it again before sending costs nothing.
  const [selectedVideos, setSelectedVideos] = useState([]);
  // { [videoId]: percent } — only populated while that video is actively
  // uploading as part of a Send in progress.
  const [videoUploadProgress, setVideoUploadProgress] = useState({});
  const [uploadingVideos, setUploadingVideos] = useState(false);
  const [sending, setSending] = useState(false);
  const stopTypingTimeout = useRef(null);
  const fileInputRef = useRef(null);

  const imagePreviews = useMemo(
    () => selectedImages.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [selectedImages]
  );

  useEffect(() => {
    return () => imagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [imagePreviews]);

  const videoPreviews = useMemo(
    () => selectedVideos.map((video) => ({ ...video, url: URL.createObjectURL(video.file) })),
    [selectedVideos]
  );

  useEffect(() => {
    return () => videoPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [videoPreviews]);

  const busy = sending || uploadingVideos;

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
      setSelectedImages((current) => {
        const combined = [...current, ...acceptedImages];

        if (combined.length > MAX_IMAGES_PER_MESSAGE) {
          toast.error(`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message`);
          return combined.slice(0, MAX_IMAGES_PER_MESSAGE);
        }

        return combined;
      });
    }

    if (acceptedVideos.length > 0) {
      setSelectedVideos((current) => {
        const combined = [...current, ...acceptedVideos];

        if (combined.length > MAX_VIDEOS_PER_MESSAGE) {
          toast.error(`You can attach up to ${MAX_VIDEOS_PER_MESSAGE} videos per message`);
          return combined.slice(0, MAX_VIDEOS_PER_MESSAGE);
        }

        return combined;
      });
    }
  };

  const removeImage = (index) => {
    setSelectedImages((current) => current.filter((_, i) => i !== index));
  };

  const removeVideo = (id) => {
    setSelectedVideos((current) => current.filter((video) => video.id !== id));
  };

  /**
   * Uploads every selected video directly to Cloudinary, one at a time
   * (sequential, so each gets its own accurate progress readout and the
   * account isn't hit with N simultaneous signature requests). Only called
   * from handleSubmit, so nothing ever reaches Cloudinary before Send is
   * pressed. Returns the verified refs the backend needs to attach them.
   */
  const uploadVideos = async (videos) => {
    const refs = [];

    for (const video of videos) {
      // Intentionally sequential (not Promise.all) — see the doc comment above.
      const authorization = await requestVideoUploadSignature(conversationId);
      const result = await uploadVideoToCloudinary(video.file, authorization, {
        onProgress: (percent) => setVideoUploadProgress((current) => ({ ...current, [video.id]: percent })),
      });
      refs.push({ publicId: result.public_id });
    }

    return refs;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = content.trim();
    if ((!trimmed && selectedImages.length === 0 && selectedVideos.length === 0) || busy) return;

    if (stopTypingTimeout.current) clearTimeout(stopTypingTimeout.current);
    stopTyping(conversationId);

    const imagesToSend = selectedImages;
    const videosToSend = selectedVideos;

    setSending(true);
    setContent('');
    setSelectedImages([]);
    setVideoUploadProgress({});

    try {
      let videoRefs = [];

      if (videosToSend.length > 0) {
        setUploadingVideos(true);
        // Message creation only happens after every video is confirmed
        // uploaded — if any upload fails, nothing below runs and no message
        // (and no socket event) is ever created.
        videoRefs = await uploadVideos(videosToSend);
        setUploadingVideos(false);
      }

      await sendMessage(conversationId, trimmed, imagesToSend, videoRefs);
      setSelectedVideos([]);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Could not send message');
      // Preserve what the user typed/picked so a failed send isn't lost —
      // videos in particular were never cleared above, so they're already
      // sitting there ready to retry.
      setContent(trimmed);
      setSelectedImages(imagesToSend);
      setUploadingVideos(false);
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

  const attachmentLimitReached = selectedImages.length >= MAX_IMAGES_PER_MESSAGE && selectedVideos.length >= MAX_VIDEOS_PER_MESSAGE;
  const canSend = (content.trim() || selectedImages.length > 0 || selectedVideos.length > 0) && !busy;

  return (
    <form onSubmit={handleSubmit} className="border-t border-white/10 p-4">
      {imagePreviews.length > 0 || videoPreviews.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {imagePreviews.map((preview, index) => (
            <div key={preview.url} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10">
              <img src={preview.url} alt={preview.file.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(index)}
                disabled={busy}
                aria-label={`Remove ${preview.file.name}`}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/80 text-slate-200 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon icon="mdi:close" width={14} />
              </button>
            </div>
          ))}

          {videoPreviews.map((preview) => {
            const progress = videoUploadProgress[preview.id];
            const isUploading = uploadingVideos && progress !== undefined;

            return (
              <div key={preview.id} className="group relative h-16 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
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
                  onClick={() => removeVideo(preview.id)}
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
      ) : null}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(',')}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || attachmentLimitReached}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/5 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Attach images or videos"
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
          <Icon icon={busy ? 'mdi:loading' : 'mdi:send'} className={busy ? 'animate-spin' : ''} width={20} />
        </button>
      </div>
    </form>
  );
};

export default MessageComposer;
