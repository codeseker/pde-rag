import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { env } from './config/env';
import { runMigrations } from './database/migrate';

async function bootstrap(): Promise<void> {
  await runMigrations();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: '5mb' });
  app.useBodyParser('urlencoded', { limit: '5mb', extended: true });
  app.enableCors();
  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
  console.log(`[api] listening on http://localhost:${env.PORT}`);
}

void bootstrap().catch((error: unknown) => {
  console.error('[api] failed to start', error);
  process.exit(1);
});
