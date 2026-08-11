// Renders the image attachments on a message. Old messages sent before this
// feature existed simply have no `attachments` field, and messages fetched
// before a reply/attachment finished populating may have an empty array —
// both are treated as "no images" rather than an error.
const gridClass = (count) => {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-2';
  return 'grid-cols-2 sm:grid-cols-3';
};

const MessageAttachments = ({ attachments }) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className={`grid gap-1 ${gridClass(attachments.length)}`}>
      {attachments.map((attachment) => (
        <a
          key={attachment._id}
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-xl border border-white/10 bg-black/20"
        >
          <img
            src={attachment.url}
            alt={attachment.originalName || 'attachment'}
            loading="lazy"
            className="h-40 w-full object-cover sm:h-48"
          />
        </a>
      ))}
    </div>
  );
};

export default MessageAttachments;
