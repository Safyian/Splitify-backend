import express from 'express';
import { register, login, logout } from '../controllers/auth.controller.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.post('/auth/register', asyncHandler(register));
router.post('/auth/login', asyncHandler(login));
router.post('/auth/logout', asyncHandler(logout));


export default router;
