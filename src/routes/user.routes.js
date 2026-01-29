import express from 'express';
import { createUser, getUsers, updateUser, deleteUser } from '../controllers/user.controller.js';

import { validate } from '../middleware/validate.middleware.js';
import { createUserSchema, updateUserSchema } from '../validators/user.validator.js';
import protect from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/users', validate(createUserSchema), createUser);
router.get('/users', protect, getUsers);
router.put('/users/:id', protect, validate(updateUserSchema), updateUser);
router.delete('/users/:id', protect, deleteUser);

export default router;
