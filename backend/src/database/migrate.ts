import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { env } from '../config/env';
import { db } from './client';
import * as schema from './schema';

const MAX_ATTEMPTS = 30;
const DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export async function runMigrations(): Promise<void> {
  const migrationsFolder = resolve(process.cwd(), 'drizzle');
  if (!existsSync(migrationsFolder)) {
    throw new Error(`Drizzle migrations folder not found: ${migrationsFolder}`);
  }

  // Managed providers often expose a pooled URL for the app and a direct URL
  // for schema changes. Migrations get their own connection when configured.
  const migrationUrl = env.MIGRATION_DATABASE_URL;
  const dedicatedPool =
    migrationUrl && migrationUrl !== env.DATABASE_URL
      ? new Pool({ connectionString: migrationUrl, max: 1 })
      : null;
  const migrationDb = dedicatedPool ? drizzle(dedicatedPool, { schema }) : db;

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await migrate(migrationDb, { migrationsFolder });
        console.log('[db] migrations applied');
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === MAX_ATTEMPTS) {
          throw new Error(
            `Database migrations failed after ${MAX_ATTEMPTS} attempts: ${message}`,
          );
        }
        console.warn(`[db] waiting for database (${attempt}/${MAX_ATTEMPTS}): ${message}`);
        await sleep(DELAY_MS);
      }
    }
  } finally {
    if (dedicatedPool) {
      await dedicatedPool.end();
    }
  }
}
