import { Inject, Injectable } from '@nestjs/common';
import { env } from '../config/env';
import type { IEmbeddingStrategy } from './interfaces/embedding-strategy.interface';
import { EMBEDDING_STRATEGIES } from './tokens';

@Injectable()
export class EmbeddingContext {
  private readonly strategies: Map<string, IEmbeddingStrategy>;
  private readonly active: IEmbeddingStrategy;

  constructor(@Inject(EMBEDDING_STRATEGIES) strategies: IEmbeddingStrategy[]) {
    this.strategies = new Map(strategies.map((strategy) => [strategy.name, strategy]));
    const selected = this.strategies.get(env.EMBEDDING_STRATEGY);
    if (!selected) {
      throw new Error(
        `Unknown EMBEDDING_STRATEGY "${env.EMBEDDING_STRATEGY}". Available: ${this.availableNames().join(', ')}`,
      );
    }
    this.active = selected;
  }

  get name(): string {
    return this.active.name;
  }

  get dimensions(): number {
    return this.active.dimensions;
  }

  get available(): string[] {
    return this.availableNames();
  }

  embed(texts: string[]): Promise<number[][]> {
    return this.active.embed(texts);
  }

  embedQuery(text: string): Promise<number[]> {
    return this.active.embedQuery(text);
  }

  assertStoredModel(storedEmbeddingModel: string): void {
    if (storedEmbeddingModel !== this.name) {
      throw new Error(
        `Embedding model mismatch: the database contains chunks embedded with "${storedEmbeddingModel}", but EMBEDDING_STRATEGY resolves to "${this.name}". Re-feed the corpus with the active strategy or switch back to "${storedEmbeddingModel}".`,
      );
    }
  }

  private availableNames(): string[] {
    return [...this.strategies.keys()].sort();
  }
}
