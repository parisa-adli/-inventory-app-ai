import './config/load-env.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { connectDatabase } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

// Routes
app.use(routes);

// Error handler (must be last)
app.use(errorHandler);

// Connect to database and start server
const startServer = async () => {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 CORS enabled for ${CLIENT_URL}`);
  });
};

startServer();
