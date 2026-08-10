import { Router } from 'express';
import { forgotPassword, login, logout, me, resetPasswordController, signup, verifyOtp } from '../controllers/auth.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import validateRequest from '../middleware/validate.middleware.js';
import {
  forgotPasswordValidation,
  loginValidation,
  resetPasswordValidation,
  signupValidation,
  verifyOtpValidation,
} from '../validators/auth.validator.js';

const router = Router();

router.post('/signup', signupValidation, validateRequest, signup);
router.post('/login', loginValidation, validateRequest, login);
router.post('/forgot-password', forgotPasswordValidation, validateRequest, forgotPassword);
router.post('/verify-otp', verifyOtpValidation, validateRequest, verifyOtp);
router.post('/reset-password', resetPasswordValidation, validateRequest, resetPasswordController);
router.post('/logout', logout);
router.get('/me', authMiddleware, me);

export default router;
