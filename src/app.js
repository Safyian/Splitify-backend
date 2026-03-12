import express from 'express';
import userRoutes from './routes/user.routes.js';
import errorHandler from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import groupRoutes from './routes/groups.routes.js';
import expenseRoutes from './routes/expenses.routes.js';
import friendsRouter from './routes/friends.routes.js';
import activityRouter from './routes/activity.routes.js';

const app = express();

app.use(express.json());
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use(authRoutes);
app.use(userRoutes);
app.use(groupRoutes);
app.use(expenseRoutes);
app.use(friendsRouter);
app.use(activityRouter);  // ← ADD THIS

app.use(errorHandler);

export default app;