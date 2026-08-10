import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import AppError from '../utils/AppError.js';
import User from '../models/User.js';
import PasswordResetOtp from '../models/PasswordResetOtp.js';
import { sendPasswordResetOtpEmail } from './email.service.js';
import { signAccessToken, signResetToken, verifyResetToken } from './token.service.js';

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const generateOtpCode = () => randomInt(100000, 1000000).toString();

const signupUser = async ({ name, email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    throw new AppError('Email is already registered', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
  });

  return sanitizeUser(user);
};

const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError('Invalid email or password', 401);
  }

  const accessToken = signAccessToken({
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  return {
    accessToken,
    user: sanitizeUser(user),
  };
};

const createPasswordResetOtp = async ({ email }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    return { message: 'If the email exists, an OTP has been sent' };
  }

  const otp = generateOtpCode();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await PasswordResetOtp.deleteMany({ email: normalizedEmail, purpose: 'password-reset' });

  await PasswordResetOtp.create({
    email: normalizedEmail,
    otpHash,
    purpose: 'password-reset',
    expiresAt,
  });

  await sendPasswordResetOtpEmail({
    to: normalizedEmail,
    name: user.name,
    otp,
  });

  return { message: 'If the email exists, an OTP has been sent' };
};

const verifyPasswordResetOtp = async ({ email, otp }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const otpRecord = await PasswordResetOtp.findOne({
    email: normalizedEmail,
    purpose: 'password-reset',
  }).select('+otpHash');

  if (!otpRecord || otpRecord.usedAt) {
    throw new AppError('OTP is invalid or expired', 400);
  }

  if (otpRecord.expiresAt.getTime() < Date.now()) {
    await PasswordResetOtp.deleteOne({ _id: otpRecord._id });
    throw new AppError('OTP is invalid or expired', 400);
  }

  const isOtpValid = await bcrypt.compare(otp, otpRecord.otpHash);

  if (!isOtpValid) {
    otpRecord.attempts += 1;

    if (otpRecord.attempts >= 5) {
      await PasswordResetOtp.deleteOne({ _id: otpRecord._id });
    } else {
      await otpRecord.save();
    }

    throw new AppError('OTP is invalid or expired', 400);
  }

  otpRecord.usedAt = new Date();
  await otpRecord.save();

  const resetToken = signResetToken({ email: normalizedEmail });

  return {
    resetToken,
    message: 'OTP verified successfully',
  };
};

const resetPassword = async ({ resetToken, newPassword }) => {
  if (!resetToken) {
    throw new AppError('Reset session is missing', 401);
  }

  const decodedToken = verifyResetToken(resetToken);

  if (decodedToken.purpose !== 'password-reset') {
    throw new AppError('Reset session is invalid', 401);
  }

  const user = await User.findOne({ email: decodedToken.email }).select('+passwordHash');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  await PasswordResetOtp.deleteMany({ email: decodedToken.email, purpose: 'password-reset' });

  return {
    message: 'Password reset successfully',
  };
};

const getAuthenticatedUser = async (userId) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return sanitizeUser(user);
};

export {
  createPasswordResetOtp,
  getAuthenticatedUser,
  loginUser,
  resetPassword,
  signupUser,
  verifyPasswordResetOtp,
};
