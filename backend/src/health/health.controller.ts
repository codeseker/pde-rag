import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { errorMessage } from '../database/database-errors';

type CheckStatus = 'ok' | 'unavailable';

interface CheckResult {
  status: CheckStatus;
  detail?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unavailable';
  service: 'pde-rag-api';
  uptimeSeconds: number;
  checks: {
    api: CheckResult;
    database: CheckResult;
    verifier: CheckResult;
  };
}

@Controller()
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Render's health check points here. 200 means the API can serve requests
   * and the database is reachable. 503 means the container is up but the app is
   * not actually usable, so a broken deploy is never reported as healthy.
   */
  @Get('health')
  @Header('Cache-Control', 'no-store')
  async health(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const [database, verifier] = await Promise.all([
      this.database.check(),
      this.checkVerifier(),
    ]);

    const status: HealthResponse['status'] = database.ok
      ? verifier.status === 'ok'
        ? 'ok'
        : 'degraded'
      : 'unavailable';

    response.status(database.ok ? 200 : 503);

    return {
      status,
      service: 'pde-rag-api',
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        api: { status: 'ok' },
        database: database.ok
          ? { status: 'ok' }
          : { status: 'unavailable', detail: database.detail },
        verifier: verifier.status === 'ok'
          ? { status: 'ok' }
          : { status: 'unavailable', detail: verifier.detail },
      },
    };
  }

  /** Liveness only: useful to distinguish "process is up" from "DB is ready". */
  @Get('live')
  @Header('Cache-Control', 'no-store')
  live(): { status: 'ok'; uptimeSeconds: number } {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async checkVerifier(): Promise<CheckResult> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), env.DB_HEALTH_TIMEOUT_MS);
      const response = await fetch(`${env.VERIFIER_URL}/health`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        return { status: 'unavailable', detail: `HTTP ${response.status}` };
      }
      return { status: 'ok' };
    } catch (error) {
      return { status: 'unavailable', detail: errorMessage(error) };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
