import express from 'express';
import { register, login, logout, getMe } from '../controllers/auth.controller.js';
import asyncHandler from '../utils/asyncHandler.js';
import protect from "../middleware/auth.middleware.js";

const router = express.Router();

router.post('/auth/register', asyncHandler(register));
router.post('/auth/login', asyncHandler(login));
router.post('/auth/logout', asyncHandler(logout));
router.get("/auth/me",protect, (getMe));

export default router;
