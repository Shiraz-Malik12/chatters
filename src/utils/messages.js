// Shared by the reply-preview bar (MessageComposer.jsx) and the quoted block
// on a reply bubble (MessageBubble.jsx), so both describe a message being
// replied to the same way.

/** One-line label for an attachment-only reply target, e.g. "📷 Photo". */
const ATTACHMENT_TYPE_LABELS = {
  image: '📷 Photo',
  video: '🎬 Video',
  file: '📎 File',
};

/**
 * Short one-line summary of a message, for use as a reply quote. Falls back
 * to an attachment-type label when there's no text (e.g. an image-only
 * message), and flags already-deleted messages so callers can render a
 * "deleted" placeholder instead of stale content.
 * @param {{content?: string, type?: string, isDeleted?: boolean} | null | undefined} message
 * @returns {{text: string, isDeleted: boolean}}
 */
export const getReplyPreview = (message) => {
  if (!message) {
    return { text: 'Original message unavailable', isDeleted: false };
  }

  if (message.isDeleted) {
    return { text: 'This message was deleted', isDeleted: true };
  }

  const trimmed = message.content?.trim();
  if (trimmed) {
    return { text: trimmed, isDeleted: false };
  }

  return { text: ATTACHMENT_TYPE_LABELS[message.type] || 'Attachment', isDeleted: false };
};
