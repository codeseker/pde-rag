import { Injectable } from '@nestjs/common';
import { OllamaEmbeddings } from '@langchain/ollama';
import { env } from '../../config/env';
import { VECTOR_DIMENSIONS } from '../../database/schema';
import type { IEmbeddingStrategy } from '../interfaces/embedding-strategy.interface';

@Injectable()
export class OllamaEmbeddingStrategy implements IEmbeddingStrategy {
  readonly name = 'ollama';
  readonly dimensions = VECTOR_DIMENSIONS;
  private readonly embeddings: OllamaEmbeddings;

  constructor() {
    this.embeddings = new OllamaEmbeddings({
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_EMBEDDING_MODEL,
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
          `Ollama returned ${vector.length}-dimensional embeddings, but the database expects ${this.dimensions}. Use an Ollama embedding model with ${this.dimensions} dimensions (default: bge-m3), or create a matching migration.`,
        );
      }
    }
  }
}
