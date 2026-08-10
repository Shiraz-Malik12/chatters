import apiClient from './client';

const getMessages = async (conversationId, { cursor, limit } = {}) => {
  const response = await apiClient.get(`/api/messages/conversation/${conversationId}`, {
    params: { cursor, limit },
  });
  return response.data.data;
};

const sendMessage = async (conversationId, content, type = 'text') => {
  const response = await apiClient.post(`/api/messages/conversation/${conversationId}`, { content, type });
  return response.data.data;
};

const updateMessage = async (messageId, content) => {
  const response = await apiClient.put(`/api/messages/${messageId}`, { content });
  return response.data.data;
};

const deleteMessage = async (messageId, deleteFor = 'me') => {
  const response = await apiClient.delete(`/api/messages/${messageId}`, { data: { deleteFor } });
  return response.data.data;
};

const reactToMessage = async (messageId, emoji) => {
  const response = await apiClient.post(`/api/messages/${messageId}/react`, { emoji });
  return response.data.data;
};

const markConversationRead = async (conversationId) => {
  const response = await apiClient.put(`/api/messages/conversation/${conversationId}/read`);
  return response.data.data;
};

const searchMessages = async (conversationId, query) => {
  const response = await apiClient.get('/api/messages/search', { params: { conversationId, query } });
  return response.data.data;
};

export {
  deleteMessage,
  getMessages,
  markConversationRead,
  reactToMessage,
  searchMessages,
  sendMessage,
  updateMessage,
};
