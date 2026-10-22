import { Module } from '@nestjs/common';
import { AskModule } from './ask/ask.module';
import { DatabaseModule } from './database/database.module';
import { FeedModule } from './feed/feed.module';
import { HealthModule } from './health/health.module';
import { ModelsModule } from './models/models.module';

@Module({
  imports: [DatabaseModule, ModelsModule, FeedModule, AskModule, HealthModule],
})
export class AppModule {}
