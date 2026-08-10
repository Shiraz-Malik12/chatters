const getOtherParticipant = (conversation, currentUserId) => {
  if (conversation.type !== 'private') return null;

  const participant = conversation.participants.find(
    (item) => String(item.user?._id || item.user) !== String(currentUserId)
  );

  return participant?.user || null;
};

const getConversationDisplay = (conversation, currentUserId) => {
  if (conversation.type === 'group') {
    return {
      name: conversation.groupName || 'Group chat',
      avatar: conversation.groupAvatar || '',
    };
  }

  const other = getOtherParticipant(conversation, currentUserId);

  return {
    name: other?.name || 'Unknown user',
    avatar: other?.avatar || '',
    otherParticipant: other,
  };
};

const getInitials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

export { getConversationDisplay, getInitials, getOtherParticipant };
