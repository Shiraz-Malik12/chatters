import apiClient from './client';

const getMessages = async (conversationId, { cursor, limit } = {}) => {
  const response = await apiClient.get(`/api/messages/conversation/${conversationId}`, {
    params: { cursor, limit },
  });
  return response.data.data;
};

const sendMessage = async (
  conversationId,
  content,
  { type = 'text', images = [], videoAttachments = [], replyTo = null } = {}
) => {
  // Video bytes were already uploaded directly to Cloudinary (see
  // api/media.js) — videoAttachments here is just an array of tiny
  // {publicId} refs, small enough to always ride along as JSON even in a
  // multipart request. replyTo is just as small — a single message id — so
  // it rides along the same way in both branches below.
  if (images.length > 0) {
    const formData = new FormData();
    formData.append('content', content || '');
    images.forEach((image) => formData.append('images', image));
    if (videoAttachments.length > 0) {
      formData.append('videoAttachments', JSON.stringify(videoAttachments));
    }
    if (replyTo) {
      formData.append('replyTo', replyTo);
    }

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

  // No image files, so no multipart body is needed even if there are
  // videos — a plain JSON request keeps the (already-verified) video refs
  // just as well.
  const response = await apiClient.post(`/api/messages/conversation/${conversationId}`, {
    content,
    type,
    videoAttachments,
    replyTo,
  });
  return response.data.data;
};

const updateMessage = async (messageId, content, { images = [], videoAttachments = [] } = {}) => {
  // Same FormData + cleared-Content-Type trick as sendMessage — see the
  // comment there for why the header override is necessary. As with
  // sendMessage, video bytes are already uploaded directly to Cloudinary by
  // this point, so videoAttachments is just an array of tiny {publicId}
  // refs that rides along either as a form field or plain JSON.
  if (images.length > 0) {
    const formData = new FormData();
    formData.append('content', content || '');
    images.forEach((image) => formData.append('images', image));
    if (videoAttachments.length > 0) {
      formData.append('videoAttachments', JSON.stringify(videoAttachments));
    }

    const response = await apiClient.put(`/api/messages/${messageId}`, formData, {
      headers: { 'Content-Type': undefined },
    });
    return response.data.data;
  }

  if (videoAttachments.length > 0) {
    const response = await apiClient.put(`/api/messages/${messageId}`, { content, videoAttachments });
    return response.data.data;
  }

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

const reactToAttachment = async (attachmentId, emoji) => {
  const response = await apiClient.post(`/api/messages/attachments/${attachmentId}/react`, { emoji });
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
  reactToAttachment,
  reactToMessage,
  searchMessages,
  sendMessage,
  updateMessage,
};
