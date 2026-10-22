import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import { errorMessage } from './database-errors';
import * as schema from './schema';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  keepAlive: true,
});

/**
 * An idle-client error (for example the provider terminating a connection) is
 * emitted on the Pool. Node treats an unhandled 'error' event as a fatal
 * exception, which would take the whole API down and turn every proxied
 * request into a 502. Keep the API alive and let DatabaseService report and
 * recover from the outage instead.
 */
pool.on('error', (error) => {
  console.error(`[db] idle client error: ${errorMessage(error)}`);
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
