import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { startTelegramBot } from './services/telegram.js';

const app = createApp();

// Connect to database and start server
const startServer = async () => {
  await connectDatabase();

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 Server running on http://localhost:${env.PORT}`);
    console.log(`📡 CORS enabled for ${env.CLIENT_URL}`);
  });

  // The bot is started here (not in createApp) so tests never start one
  const stopBot = await startTelegramBot();
  const shutdown = () => {
    void stopBot().finally(() => server.close(() => process.exit(0)));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
};

startServer();
