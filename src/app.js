// for setting up express app
import express from 'express';
import userRoutes from './routes/user.routes.js';
import errorHandler from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import groupRoutes from './routes/groups.routes.js';
import expenseRoutes from "./routes/expenses.routes.js";

const app = express();

// Body parsing middleware
app.use(express.json());

// Public routes (NO auth required)
app.use(authRoutes);

// Protected / feature routes
app.use(userRoutes);

// Importing group routes
app.use(groupRoutes);

// Importing expense routes
app.use(expenseRoutes);


// Global error handler (ALWAYS LAST)
app.use(errorHandler);

export default app;

