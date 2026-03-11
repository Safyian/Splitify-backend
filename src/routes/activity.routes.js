import express from 'express';
import { getActivity } from '../controllers/activity.controller.js';
import protect from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/activity', protect, getActivity);

export default router;