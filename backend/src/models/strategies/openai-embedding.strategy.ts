import { Injectable } from '@nestjs/common';
import { OpenAIEmbeddings } from '@langchain/openai';
import { env } from '../../config/env';
import { VECTOR_DIMENSIONS } from '../../database/schema';
import type { IEmbeddingStrategy } from '../interfaces/embedding-strategy.interface';

@Injectable()
export class OpenAiEmbeddingStrategy implements IEmbeddingStrategy {
  readonly name = 'openai';
  readonly dimensions = VECTOR_DIMENSIONS;
  private readonly embeddings: OpenAIEmbeddings;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      apiKey: env.OPENAI_API_KEY?.trim() || 'missing-openai-api-key',
      model: env.OPENAI_EMBEDDING_MODEL,
      dimensions: this.dimensions,
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const vectors = await this.embeddings.embedDocuments(texts);
    this.assertDimensions(vectors);
    return vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    const vector = await this.embeddings.embedQuery(text);
    this.assertDimensions([vector]);
    return vector;
  }

  private assertDimensions(vectors: number[][]): void {
    for (const vector of vectors) {
      if (vector.length !== this.dimensions) {
        throw new Error(
          `OpenAI returned ${vector.length}-dimensional embeddings, but the database expects ${this.dimensions}. Set OPENAI_EMBEDDING_MODEL to a model that supports ${this.dimensions} dimensions (or create a matching migration).`,
        );
      }
    }
  }
}
