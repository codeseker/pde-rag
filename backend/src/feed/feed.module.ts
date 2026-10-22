import { Module } from '@nestjs/common';
import { ChunkRepository } from '../database/chunk.repository';
import { ModelsModule } from '../models/models.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [ModelsModule],
  controllers: [FeedController],
  providers: [FeedService, ChunkRepository],
})
export class FeedModule {}
