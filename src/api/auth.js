import apiClient from './client';

const signup = async (payload) => {
  const response = await apiClient.post('/api/auth/signup', payload);
  return response.data;
};

const login = async (payload) => {
  const response = await apiClient.post('/api/auth/login', payload);
  return response.data;
};

const forgotPassword = async (payload) => {
  const response = await apiClient.post('/api/auth/forgot-password', payload);
  return response.data;
};

const verifyOtp = async (payload) => {
  const response = await apiClient.post('/api/auth/verify-otp', payload);
  return response.data;
};

const resetPassword = async (payload) => {
  const response = await apiClient.post('/api/auth/reset-password', payload);
  return response.data;
};

const logout = async () => {
  const response = await apiClient.post('/api/auth/logout');
  return response.data;
};

const getMe = async () => {
  const response = await apiClient.get('/api/auth/me');
  return response.data;
};

export { forgotPassword, getMe, login, logout, resetPassword, signup, verifyOtp };