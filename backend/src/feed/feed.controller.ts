import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FeedService, type UploadedPdf } from './feed.service';

@Controller()
export class FeedController {
  constructor(private readonly feed: FeedService) {}

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
    return this.feed.ingest(file, body);
  }
}
