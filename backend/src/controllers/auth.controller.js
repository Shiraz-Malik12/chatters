import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  createPasswordResetOtp,
  getAuthenticatedUser,
  loginUser,
  resetPassword,
  signupUser,
  verifyPasswordResetOtp,
} from '../services/auth.service.js';

const accessTokenCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

const resetTokenCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

const accessTokenMaxAge = 7 * 24 * 60 * 60 * 1000;
const resetTokenMaxAge = 15 * 60 * 1000;

const signup = asyncHandler(async (request, response) => {
  const user = await signupUser(request.body);

  return response.status(201).json({
    success: true,
    message: 'Account created successfully',
    user,
  });
});

const login = asyncHandler(async (request, response) => {
  const { accessToken, user } = await loginUser(request.body);

  response.cookie('accessToken', accessToken, {
    ...accessTokenCookieOptions,
    maxAge: accessTokenMaxAge,
  });

  return response.status(200).json({
    success: true,
    message: 'Logged in successfully',
    user,
  });
});

const forgotPassword = asyncHandler(async (request, response) => {
  const result = await createPasswordResetOtp(request.body);

  return response.status(200).json({
    success: true,
    message: result.message,
  });
});

const verifyOtp = asyncHandler(async (request, response) => {
  const { resetToken, message } = await verifyPasswordResetOtp(request.body);

  response.cookie('passwordResetToken', resetToken, {
    ...resetTokenCookieOptions,
    maxAge: resetTokenMaxAge,
  });

  return response.status(200).json({
    success: true,
    message,
  });
});

const resetPasswordController = asyncHandler(async (request, response) => {
  const resetToken = request.cookies?.passwordResetToken || request.body.resetToken;

  if (!resetToken) {
    throw new AppError('Reset session is missing', 401);
  }

  const result = await resetPassword({
    resetToken,
    newPassword: request.body.newPassword,
  });

  response.clearCookie('passwordResetToken', resetTokenCookieOptions);

  return response.status(200).json({
    success: true,
    message: result.message,
  });
});

const logout = asyncHandler(async (request, response) => {
  response.clearCookie('accessToken', accessTokenCookieOptions);
  response.clearCookie('passwordResetToken', resetTokenCookieOptions);

  return response.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

const me = asyncHandler(async (request, response) => {
  const user = await getAuthenticatedUser(request.user.id);

  return response.status(200).json({
    success: true,
    user,
  });
});

export { forgotPassword, login, logout, me, resetPasswordController, signup, verifyOtp };
