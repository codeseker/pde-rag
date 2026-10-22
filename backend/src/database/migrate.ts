import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { env } from '../config/env';
import { db } from './client';
import { errorMessage } from './database-errors';
import * as schema from './schema';

const DEFAULT_MAX_ATTEMPTS = 30;
const DEFAULT_DELAY_MS = 2000;

export interface MigrationOptions {
  maxAttempts?: number;
  delayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export async function runMigrations(options: MigrationOptions = {}): Promise<void> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  const migrationsFolder = resolve(process.cwd(), 'drizzle');
  if (!existsSync(migrationsFolder)) {
    throw new Error(`Drizzle migrations folder not found: ${migrationsFolder}`);
  }

  // Managed providers often expose a pooled URL for the app and a direct URL
  // for schema changes. Migrations get their own connection when configured.
  const migrationUrl = env.MIGRATION_DATABASE_URL;
  const dedicatedPool =
    migrationUrl && migrationUrl !== env.DATABASE_URL
      ? new Pool({ connectionString: migrationUrl, max: 1, connectionTimeoutMillis: 10_000 })
      : null;
  const migrationDb = dedicatedPool ? drizzle(dedicatedPool, { schema }) : db;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await migrate(migrationDb, { migrationsFolder });
        console.log('[db] migrations applied');
        return;
      } catch (error) {
        const message = errorMessage(error);
        if (attempt === maxAttempts) {
          throw new Error(
            `Database migrations failed after ${maxAttempts} attempts: ${message}`,
          );
        }
        console.warn(`[db] waiting for database (${attempt}/${maxAttempts}): ${message}`);
        await sleep(delayMs);
      }
    }
  } finally {
    if (dedicatedPool) {
      await dedicatedPool.end();
    }
  }
}
