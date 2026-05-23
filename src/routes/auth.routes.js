import express from 'express';
import { register, login, logout, getMe, updateMe, deleteMe, verifyEmail, resendVerification, forgotPassword, showResetForm, resetPassword, checkContacts } from '../controllers/auth.controller.js';
import asyncHandler from '../utils/asyncHandler.js';
import protect from "../middleware/auth.middleware.js";
import { validate } from '../middleware/validate.middleware.js';
import { registerSchema, loginSchema, forgotPasswordSchema } from '../validators/user.validator.js';

const router = express.Router();

router.post('/auth/register', validate(registerSchema), asyncHandler(register));
router.post('/auth/login', validate(loginSchema), asyncHandler(login));
router.post('/auth/logout', asyncHandler(logout));
router.get("/auth/me",protect, (getMe));

// Add after your existing public routes:
router.patch('/auth/me', protect, updateMe);
router.delete('/auth/me', protect, deleteMe);

router.get('/auth/verify/:token', asyncHandler(verifyEmail));
router.post('/auth/resend-verification', asyncHandler(resendVerification));

router.post('/users/check-contacts', protect, asyncHandler(checkContacts));

router.post('/auth/forgot-password', validate(forgotPasswordSchema), asyncHandler(forgotPassword));
router.get('/auth/reset-password', asyncHandler(showResetForm));
router.post('/auth/reset-password', asyncHandler(resetPassword));

export default router;
