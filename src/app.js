import express from 'express';
import rateLimit from 'express-rate-limit';
import userRoutes from './routes/user.routes.js';
import errorHandler from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import groupRoutes from './routes/groups.routes.js';
import expenseRoutes from './routes/expenses.routes.js';
import friendsRouter from './routes/friends.routes.js';
import activityRouter from './routes/activity.routes.js';

const app = express();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many attempts. Please try again later.' },
});

app.use(express.json());
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.use(authRoutes);
app.use(userRoutes);
app.use(groupRoutes);
app.use(expenseRoutes);
app.use(friendsRouter);
app.use(activityRouter);  // ← ADD THIS

app.use(errorHandler);

export default app;