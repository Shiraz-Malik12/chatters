/**
 * Toggles a user's reaction within a reactions array. Shared by
 * Message.reactions and Attachment.reactions (see models/reactionSchema.js)
 * so whole-message and per-image reactions behave identically.
 *
 * Behavior:
 * - Tapping the emoji you already picked removes it (plain toggle-off).
 * - `exclusive: true` — used for private 1:1 conversations — additionally
 *   removes the user from every *other* emoji bucket first, so each person
 *   can only ever have one active reaction at a time. With exactly two
 *   participants this means a message/image shows at most two reaction
 *   badges, one per person, and picking a new emoji swaps out your old one.
 * - `exclusive: false` — group conversations — leaves other buckets alone,
 *   preserving the original behavior where one user could stack multiple
 *   different emojis on the same message.
 *
 * Pure function: takes a plain/mongoose reactions array, returns a brand
 * new plain array (safe to assign straight back to `doc.reactions`).
 * @param {{emoji: string, users: (string|import('mongoose').Types.ObjectId)[]}[]} reactions - Current reactions.
 * @param {string} userId - Reacting user's id.
 * @param {string} emoji - Emoji being toggled.
 * @param {{exclusive?: boolean}} [options] - exclusive: true for private 1:1 conversations.
 * @returns {{emoji: string, users: string[]}[]} Updated reactions, with any now-empty buckets dropped.
 */
export const toggleReaction = (reactions, userId, emoji, { exclusive = false } = {}) => {
  const uid = String(userId);
  const buckets = (reactions || []).map((reaction) => ({
    emoji: reaction.emoji,
    users: (reaction.users || []).map(String),
  }));

  const next = buckets.map((bucket) => {
    if (bucket.emoji !== emoji) {
      // In exclusive mode, this user can't remain reacted with anything else.
      return exclusive ? { ...bucket, users: bucket.users.filter((id) => id !== uid) } : bucket;
    }

    const hasReacted = bucket.users.includes(uid);
    return { ...bucket, users: hasReacted ? bucket.users.filter((id) => id !== uid) : [...bucket.users, uid] };
  });

  if (!next.some((bucket) => bucket.emoji === emoji)) {
    next.push({ emoji, users: [uid] });
  }

  return next.filter((bucket) => bucket.users.length > 0);
};
