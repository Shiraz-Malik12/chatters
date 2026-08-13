import { useState } from 'react';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { QUICK_REACTIONS } from '../../utils/reactions';
import { formatDuration } from '../../utils/attachments';

// Renders the image *and video* attachments on a message. Old messages sent
// before video support existed simply have attachments with no `duration`/
// `thumbnailUrl` (or `type: 'image'` outright), and messages fetched before
// an attachment finished populating may have an empty array — all treated
// as ordinary cases rather than errors.
//
// Each attachment — image or video — gets its own hover reaction button +
// emoji picker + a WhatsApp-style aggregated reaction badge, independent of
// every other attachment in the same message and independent of the
// message-level reaction in MessageBubble — so a message with several
// pictures/videos lets people react to one specific item (or all of them
// individually) rather than only the message as a whole.
const gridClass = (count) => {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-2';
  return 'grid-cols-2 sm:grid-cols-3';
};

/** Sums every emoji bucket's user count into one total. */
const totalReactionCount = (reactions) => reactions.reduce((sum, reaction) => sum + (reaction.users?.length || 0), 0);

/** Top 2 emojis by reaction count — the small icons shown on the summary badge, same idea as WhatsApp's message reaction pill. */
const topEmojis = (reactions) =>
  [...reactions]
    .sort((a, b) => (b.users?.length || 0) - (a.users?.length || 0))
    .slice(0, 2)
    .map((reaction) => reaction.emoji);

const MessageAttachments = ({ attachments }) => {
  const { user } = useAuth();
  const { reactToAttachment } = useChat();
  const [openPickerId, setOpenPickerId] = useState(null);
  const [openSummaryId, setOpenSummaryId] = useState(null);

  if (!attachments || attachments.length === 0) return null;

  const handleReact = async (attachmentId, emoji) => {
    setOpenPickerId(null);
    try {
      await reactToAttachment(attachmentId, emoji);
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'Could not react to image');
    }
  };

  return (
    <div className={`grid gap-1 ${gridClass(attachments.length)}`}>
      {attachments.map((attachment) => {
        const reactions = attachment.reactions || [];
        const hasOwnReaction = reactions.some((reaction) => reaction.users?.some((id) => String(id) === String(user?.id)));

        return (
          // `group/image` is a Tailwind *named* group, scoped to this one
          // image — a plain `group` here would also react to hovering any
          // sibling image, since they'd all share the bubble's outer group.
          // Note there's no `overflow-hidden` on this outer element: the
          // emoji picker below is an absolutely-positioned popover that can
          // be wider than a narrow grid tile, and clipping it here would cut
          // it off. Only the image itself (wrapped below) clips to rounded
          // corners.
          <div key={attachment._id} className="group/image relative rounded-xl border border-white/10 bg-black/20">
            {attachment.type === 'video' ? (
              <div className="relative overflow-hidden rounded-xl">
                <video
                  src={attachment.url}
                  poster={attachment.thumbnailUrl || undefined}
                  controls
                  // Only fetches duration/dimensions up front, never the full
                  // video — critical once a conversation has many videos in
                  // its history (see gridClass usage above for layout, this
                  // is what keeps opening a long chat from downloading them all).
                  preload="metadata"
                  className="h-40 w-full bg-black object-contain sm:h-48"
                />
                {attachment.duration ? (
                  <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] text-slate-100">
                    {formatDuration(attachment.duration)}
                  </span>
                ) : null}
              </div>
            ) : (
              <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl">
                <img
                  src={attachment.url}
                  alt={attachment.originalName || 'attachment'}
                  loading="lazy"
                  className="h-40 w-full object-cover sm:h-48"
                />
              </a>
            )}

            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setOpenSummaryId(null);
                setOpenPickerId((current) => (current === attachment._id ? null : attachment._id));
              }}
              aria-label="React to image"
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/70 text-slate-200 opacity-0 transition-opacity duration-150 ease-out pointer-events-none group-hover/image:opacity-100 group-hover/image:pointer-events-auto"
            >
              <Icon icon="mdi:emoticon-outline" width={16} />
            </button>

            {openPickerId === attachment._id ? (
              <div
                onClick={(event) => event.stopPropagation()}
                // flex-wrap + a max width keeps the 5 quick-reaction emojis
                // from running off the edge of a narrow grid tile — they
                // wrap onto a second row instead of getting clipped.
                className="absolute right-1 top-9 z-10 flex w-28 flex-wrap gap-1 rounded-2xl bg-slate-950/90 px-2 py-1.5 shadow-lg"
              >
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      handleReact(attachment._id, emoji);
                    }}
                    className="text-sm transition-transform duration-100 hover:scale-125"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}

            {reactions.length > 0 ? (
              <div className="absolute bottom-1 left-1">
                {/* One aggregated badge per image (top emojis + total count),
                    WhatsApp-style, instead of a separate pill per emoji. */}
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpenPickerId(null);
                    setOpenSummaryId((current) => (current === attachment._id ? null : attachment._id));
                  }}
                  className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs backdrop-blur transition-colors duration-150 ${
                    hasOwnReaction ? 'bg-cyan-500/80 text-slate-950' : 'bg-slate-950/70 text-slate-100'
                  }`}
                >
                  <span>{topEmojis(reactions).join(' ')}</span>
                  <span>{totalReactionCount(reactions)}</span>
                </button>

                {openSummaryId === attachment._id ? (
                  // Breakdown of exactly how many reacted with each emoji —
                  // tucked behind a tap on the badge instead of always
                  // cluttering the image with one pill per emoji.
                  <div
                    onClick={(event) => event.stopPropagation()}
                    className="absolute bottom-7 left-0 z-10 min-w-max space-y-1 rounded-2xl bg-slate-950/90 px-2 py-1.5 shadow-lg"
                  >
                    {reactions.map((reaction) => (
                      <button
                        key={reaction.emoji}
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          handleReact(attachment._id, reaction.emoji);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-0.5 text-xs text-slate-100 transition-colors duration-150 hover:bg-white/10"
                      >
                        <span>{reaction.emoji}</span>
                        <span className="text-slate-300">{reaction.users?.length}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default MessageAttachments;
