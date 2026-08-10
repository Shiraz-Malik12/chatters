import apiClient from './client';

const listConversations = async () => {
  const response = await apiClient.get('/api/conversations');
  return response.data.data;
};

const getConversation = async (conversationId) => {
  const response = await apiClient.get(`/api/conversations/${conversationId}`);
  return response.data.data;
};

const startPrivateConversation = async (targetId) => {
  const response = await apiClient.post('/api/conversations', { type: 'private', targetId });
  return response.data.data;
};

const startGroupConversation = async ({ name, members, groupAvatar, groupDescription }) => {
  const response = await apiClient.post('/api/conversations', {
    type: 'group',
    name,
    members,
    groupAvatar,
    groupDescription,
  });
  return response.data.data;
};

const updateConversation = async (conversationId, payload) => {
  const response = await apiClient.put(`/api/conversations/${conversationId}`, payload);
  return response.data.data;
};

const deleteConversation = async (conversationId) => {
  const response = await apiClient.delete(`/api/conversations/${conversationId}`);
  return response.data;
};

const addConversationMember = async (conversationId, userId) => {
  const response = await apiClient.post(`/api/conversations/${conversationId}/members`, { userId });
  return response.data.data;
};

const removeConversationMember = async (conversationId, userId) => {
  const response = await apiClient.delete(`/api/conversations/${conversationId}/members/${userId}`);
  return response.data.data;
};

const toggleMuteConversation = async (conversationId, mute) => {
  const response = await apiClient.put(`/api/conversations/${conversationId}/mute`, { mute });
  return response.data.data;
};

const toggleArchiveConversation = async (conversationId, archive) => {
  const response = await apiClient.put(`/api/conversations/${conversationId}/archive`, { archive });
  return response.data.data;
};

export {
  addConversationMember,
  deleteConversation,
  getConversation,
  listConversations,
  removeConversationMember,
  startGroupConversation,
  startPrivateConversation,
  toggleArchiveConversation,
  toggleMuteConversation,
  updateConversation,
};
