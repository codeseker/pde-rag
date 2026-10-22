import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { redactSecrets } from '../database/database-errors';
import { DatabaseService } from '../database/database.service';
import { AskService } from './ask.service';

const AskBodySchema = z.object({
  question: z.string().trim().min(3).max(4000),
});

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    name?: unknown;
    response?: { status?: unknown };
  };

  return (
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('too many requests') ||
    message.includes('429') ||
    record.status === 429 ||
    record.statusCode === 429 ||
    record.response?.status === 429 ||
    record.code === 'rate_limit_exceeded' ||
    record.name === 'RateLimitCapacityError'
  );
}

function publicErrorMessage(error: unknown): string {
  if (isRateLimitError(error)) {
    return 'The model provider is rate-limited right now. Wait about 30 seconds, then try again.';
  }
  return 'The answer could not be generated right now. Please try again.';
}

@Controller()
export class AskController {
  private readonly logger = new Logger(AskController.name);

  constructor(
    private readonly ask: AskService,
    private readonly database: DatabaseService,
  ) {}

  @Post('ask')
  @HttpCode(200)
  async answer(
    @Body() body: unknown,
    @Query('stream') stream: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const parsed = AskBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Body must be {"question": "..."} with 3-4000 characters.');
    }

    if (!this.database.isReady()) {
      response.status(503).json({
        statusCode: 503,
        error: 'Service Unavailable',
        message:
          'The knowledge base database is unavailable. Check GET /health and retry shortly.',
      });
      return;
    }

    if (stream === 'false') {
      try {
        const result = await this.ask.ask(parsed.data.question);
        response.json(result);
      } catch (error) {
        this.logError(error);
        throw new ServiceUnavailableException(publicErrorMessage(error));
      }
      return;
    }

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    try {
      const result = await this.ask.ask(parsed.data.question);
      const pieces = result.answer.match(/[\s\S]{1,48}/g) ?? [];
      for (const text of pieces) {
        this.send(response, { type: 'token', text });
      }
      this.send(response, { type: 'sources', sources: result.sources });
      this.send(response, { type: 'done', verification: result.verification });
    } catch (error) {
      this.logError(error);
      this.send(response, { type: 'error', message: publicErrorMessage(error) });
    } finally {
      response.end();
    }
  }

  /** Provider errors can contain request URLs; never write keys/tokens to logs. */
  private logError(error: unknown): void {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    this.logger.error(redactSecrets(message));
  }

  private send(response: Response, payload: object): void {
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}
