import apiClient from './client';

const getMessages = async (conversationId, { cursor, limit } = {}) => {
  const response = await apiClient.get(`/api/messages/conversation/${conversationId}`, {
    params: { cursor, limit },
  });
  return response.data.data;
};

const sendMessage = async (conversationId, content, { type = 'text', images = [] } = {}) => {
  if (images.length > 0) {
    const formData = new FormData();
    formData.append('content', content || '');
    images.forEach((image) => formData.append('images', image));

    // apiClient sets a default 'Content-Type: application/json' header. If we
    // don't clear it here, axios sees JSON already declared and serializes
    // the FormData into a JSON string instead of sending it as multipart —
    // so the server never sees the files. Setting it to `undefined` lets
    // axios (and the browser) detect the FormData body and set the correct
    // multipart boundary themselves; manually forcing 'multipart/form-data'
    // would omit that boundary and break parsing on the server just the same.
    const response = await apiClient.post(`/api/messages/conversation/${conversationId}`, formData, {
      headers: { 'Content-Type': undefined },
    });
    return response.data.data;
  }

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
