import { Module } from '@nestjs/common';
import { ChunkRepository } from '../database/chunk.repository';
import { ModelsModule } from '../models/models.module';
import { AskController } from './ask.controller';
import { AskGraph } from './ask.graph';
import { AskService } from './ask.service';

@Module({
  imports: [ModelsModule],
  controllers: [AskController],
  providers: [AskGraph, AskService, ChunkRepository],
})
export class AskModule {}
