import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';

const app = createApp();

// Connect to database and start server
const startServer = async () => {
  await connectDatabase();

  app.listen(env.PORT, () => {
    console.log(`🚀 Server running on http://localhost:${env.PORT}`);
    console.log(`📡 CORS enabled for ${env.CLIENT_URL}`);
  });
};

startServer();
