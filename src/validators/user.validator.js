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

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name must be at most 50 characters'),
  email: z.string().check(z.email('Invalid email format')).transform(val => val.toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .check(z.regex(/(?=.*[a-zA-Z])(?=.*[0-9])/, 'Password must contain at least one letter and one number')),
});

export const loginSchema = z.object({
  email: z.string().check(z.email('Invalid email format')),
  password: z.string().min(1, 'Password is required'),
});
