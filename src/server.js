// for starting the server
// and connecting to the database

import app from './app.js';
import connectDB from './config/db.js';
import 'dotenv/config';

const PORT = process.env.PORT || 8080;

// Connect to the database
connectDB();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
