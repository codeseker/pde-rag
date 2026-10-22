import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { env } from './config/env';
import { describeDatabaseUrl, redactSecrets } from './database/database-errors';
import { DatabaseService } from './database/database.service';

process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  console.error(`[api] unhandled rejection: ${redactSecrets(message)}`);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  console.error(`[api] uncaught exception: ${redactSecrets(error.stack ?? error.message)}`);
  process.exit(1);
});

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: '5mb' });
  app.useBodyParser('urlencoded', { limit: '5mb', extended: true });
  app.enableCors();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.enableShutdownHooks();

  console.log(
    `[api] config: llm=${env.LLM_STRATEGY} embeddings=${env.EMBEDDING_STRATEGY} ` +
      `db=${describeDatabaseUrl(env.DATABASE_URL)} verifier=${redactSecrets(env.VERIFIER_URL)}`,
  );

  // DatabaseService starts migrations in onApplicationBootstrap. Bind first so
  // nginx always has an upstream: if PostgreSQL is down, /health and API routes
  // return a truthful 503 instead of the nginx 502 caused by a missing listener.
  // (Nest calls lifecycle hooks before the socket starts accepting connections,
  // but initialization is fire-and-forget and never delays the bind.)
  const database = app.get(DatabaseService);
  await app.listen(env.PORT, '0.0.0.0');

  const status = database.getStatus();
  if (status.ready) {
    console.log(`[api] listening on 0.0.0.0:${env.PORT} (database ready)`);
  } else {
    console.log(
      `[api] listening on 0.0.0.0:${env.PORT}; database initialization is in progress. ` +
        'GET /health reports 503 until migrations succeed, then retries in the background.',
    );
  }
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[api] failed to start: ${redactSecrets(message)}`);
  process.exit(1);
});
