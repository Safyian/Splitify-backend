import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().int().min(0, 'Age must be a positive number'),
  role: z.string().optional()
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  age: z.number().int().min(0).optional(),
  role: z.string().optional()
});
