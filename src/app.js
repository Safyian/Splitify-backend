// // for setting up express app
// import express from 'express';
// import userRoutes from './routes/user.routes.js';
// import errorHandler from './middleware/error.middleware.js';
// import authRoutes from './routes/auth.routes.js';
// import groupRoutes from './routes/groups.routes.js';
// import expenseRoutes from "./routes/expenses.routes.js";
// import friendsRouter from './routes/friends.routes.js';
// import activityRouter from './routes/activity.routes.js';


// const app = express();

// // Body parsing middleware
// app.use(express.json());

// // Public routes (NO auth required)
// app.use(authRoutes);

// // Protected / feature routes
// app.use(userRoutes);

// // Importing group routes
// app.use(groupRoutes);

// // Importing expense routes
// app.use(expenseRoutes);

// // Importing friends routes
// app.use(friendsRouter);

// // Importing activity routes
// app.use(activityRouter);

// // Global error handler (ALWAYS LAST)
// app.use(errorHandler);

// export default app;

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

app.use(authRoutes);
app.use(userRoutes);
app.use(groupRoutes);
app.use(expenseRoutes);
app.use(friendsRouter);
app.use(activityRouter);  // ← ADD THIS

app.use(errorHandler);

export default app;