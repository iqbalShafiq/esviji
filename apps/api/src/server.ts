import { buildApp } from './app.js';

async function start(): Promise<void> {
  const app = await buildApp();

  const port = Number(process.env.API_PORT) || 4000;

  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`Server listening on http://localhost:${port}`);

  const gracefulShutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}. Starting graceful shutdown...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
