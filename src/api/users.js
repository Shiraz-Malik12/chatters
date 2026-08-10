import apiClient from './client';

const searchUsers = async (query) => {
  const response = await apiClient.get('/api/users', { params: { query } });
  return response.data.data;
};

export { searchUsers };
