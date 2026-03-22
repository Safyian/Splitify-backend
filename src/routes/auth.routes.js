import express from 'express';
import { register, login, logout, getMe, updateMe, deleteMe, verifyEmail, resendVerification } from '../controllers/auth.controller.js';
import asyncHandler from '../utils/asyncHandler.js';
import protect from "../middleware/auth.middleware.js";
import { validate } from '../middleware/validate.middleware.js';
import { registerSchema, loginSchema } from '../validators/user.validator.js';

const router = express.Router();

router.post('/auth/register', validate(registerSchema), asyncHandler(register));
router.post('/auth/login', validate(loginSchema), asyncHandler(login));
router.post('/auth/logout', asyncHandler(logout));
router.get("/auth/me",protect, (getMe));

// Add after your existing public routes:
router.patch('/auth/me', protect, updateMe);
router.delete('/auth/me', protect, deleteMe);

router.get('/auth/verify-email', asyncHandler(verifyEmail));
router.post('/auth/resend-verification', asyncHandler(resendVerification));

export default router;
