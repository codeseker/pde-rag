import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { env } from '../config/env';
import { pool } from './client';
import {
  describeDatabaseUrl,
  errorMessage,
} from './database-errors';
import { runMigrations } from './migrate';

export interface DatabaseStatus {
  ready: boolean;
  target: string;
  lastError: string | null;
}

/**
 * Owns database initialization and recovery.
 *
 * The HTTP listener must not be held hostage by an unreachable database:
 * otherwise nginx has a live upstream only while migrations happen to succeed
 * and returns 502 for every API request when they do not. This service starts
 * migrations, records a sanitized failure reason, and retries in the
 * background. /health exposes the state and API routes return a clear 503
 * until the database is usable again.
 */
@Injectable()
export class DatabaseService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private ready = false;
  private stopped = false;
  private lastError: string | null = null;
  private initialization: Promise<boolean> | null = null;
  private retryTimer: NodeJS.Timeout | null = null;

  onApplicationBootstrap(): void {
    if (!this.ready && !this.initialization) {
      void this.initialize();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    await pool.end().catch(() => undefined);
  }

  /**
   * Runs migrations once. Concurrent callers share the same in-flight promise,
   * so a burst of requests cannot run the migrator multiple times.
   */
  initialize(): Promise<boolean> {
    if (this.stopped) {
      return Promise.resolve(false);
    }
    if (this.initialization) {
      return this.initialization;
    }

    this.initialization = this.runInitialization().finally(() => {
      this.initialization = null;
    });
    return this.initialization;
  }

  /** True only after migrations have completed successfully. */
  isReady(): boolean {
    return this.ready;
  }

  /** Performs a real round trip so /health does not report a stale success. */
  async check(): Promise<{ ok: boolean; detail: string }> {
    if (!this.ready) {
      // A request to /health can shorten the background retry delay, but do not
      // start a second cycle while one is running or already scheduled.
      if (!this.initialization && !this.retryTimer) {
        void this.initialize();
      }
      return {
        ok: false,
        detail: this.lastError ?? 'Database initialization is still in progress.',
      };
    }

    try {
      await this.withTimeout(
        pool.query('select 1'),
        env.DB_HEALTH_TIMEOUT_MS,
        'database health check timed out',
      );
      return { ok: true, detail: 'ok' };
    } catch (error) {
      this.markUnavailable(error);
      return {
        ok: false,
        detail: this.lastError ?? 'Database health check failed.',
      };
    }
  }

  getStatus(): DatabaseStatus {
    return {
      ready: this.ready,
      target: describeDatabaseUrl(env.DATABASE_URL),
      lastError: this.lastError,
    };
  }

  private async runInitialization(): Promise<boolean> {
    try {
      await runMigrations({
        maxAttempts: env.DB_MIGRATION_ATTEMPTS,
        delayMs: env.DB_MIGRATION_RETRY_MS,
      });
      this.ready = true;
      this.lastError = null;
      this.logger.log(`Database ready (${describeDatabaseUrl(env.DATABASE_URL)})`);
      return true;
    } catch (error) {
      this.markUnavailable(error);
      return false;
    }
  }

  private markUnavailable(error: unknown): void {
    this.ready = false;
    this.lastError = errorMessage(error);
    this.logger.error(`Database unavailable: ${this.lastError}`);
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) {
      return;
    }

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.initialize();
    }, env.DB_BACKGROUND_RETRY_MS);
    // Do not keep a shutting-down process alive just for this timer.
    this.retryTimer.unref?.();
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(message)), ms);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
