import { Module } from '@nestjs/common';
import { AskModule } from './ask/ask.module';
import { FeedModule } from './feed/feed.module';
import { ModelsModule } from './models/models.module';

@Module({
  imports: [ModelsModule, FeedModule, AskModule],
})
export class AppModule {}
