import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  loginWithPhone,
  sendPhoneOtp,
  verifyPhoneOtp,
  logout,
  getMe,
  updateMe,
  deleteMe,
  verifyEmail,
  resendVerification,
  forgotPassword,
  showResetForm,
  resetPassword,
  checkContacts,
} from '../controllers/auth.controller.js';
import { inviteFriend } from '../controllers/friends.controller.js';
import asyncHandler from '../utils/asyncHandler.js';
import protect from "../middleware/auth.middleware.js";
import { validate } from '../middleware/validate.middleware.js';
import { loginSchema, forgotPasswordSchema } from '../validators/user.validator.js';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many attempts. Please try again later.' },
});

router.post('/auth/register', asyncHandler(register));
router.post('/auth/login', validate(loginSchema), asyncHandler(login));
router.post('/auth/logout', asyncHandler(logout));
router.get("/auth/me",protect, (getMe));

// Add after your existing public routes:
router.patch('/auth/me', protect, updateMe);
router.delete('/auth/me', protect, deleteMe);

router.get('/auth/verify/:token', asyncHandler(verifyEmail));
router.post('/auth/resend-verification', asyncHandler(resendVerification));

router.post('/auth/send-phone-otp', authLimiter, asyncHandler(sendPhoneOtp));
router.post('/auth/verify-phone-otp', authLimiter, asyncHandler(verifyPhoneOtp));
router.post('/auth/login-phone', authLimiter, asyncHandler(loginWithPhone));

router.post('/users/check-contacts', protect, asyncHandler(checkContacts));
router.post('/friends/invite', protect, asyncHandler(inviteFriend));

router.post('/auth/forgot-password', validate(forgotPasswordSchema), asyncHandler(forgotPassword));
router.get('/auth/reset-password', asyncHandler(showResetForm));
router.post('/auth/reset-password', asyncHandler(resetPassword));

export default router;
