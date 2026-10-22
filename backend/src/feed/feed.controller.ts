import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DatabaseService } from '../database/database.service';
import { FeedService, type UploadedPdf } from './feed.service';

@Controller()
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly database: DatabaseService,
  ) {}

  @Post('feed')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async ingest(
    @UploadedFile() file: UploadedPdf | undefined,
    @Body() body: unknown,
  ): Promise<{ documentId: string; chunks: number }> {
    if (!file && (!body || typeof body !== 'object')) {
      throw new BadRequestException('Send a PDF field named "file" or JSON {title, text}.');
    }

    // DatabaseService starts the API even when PostgreSQL is temporarily down.
    // Report that truthfully without making the client wait for a migration
    // cycle; it retries in the background and /health exposes progress.
    if (!this.database.isReady()) {
      throw new ServiceUnavailableException(
        'The knowledge base database is unavailable. Check GET /health and retry shortly.',
      );
    }

    return this.feed.ingest(file, body);
  }
}
