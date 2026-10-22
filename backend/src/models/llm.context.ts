import { Inject, Injectable } from '@nestjs/common';
import { env } from '../config/env';
import type { ILlmStrategy } from './interfaces/llm-strategy.interface';
import { LLM_STRATEGIES } from './tokens';

@Injectable()
export class LlmContext {
  private readonly strategies: Map<string, ILlmStrategy>;
  private readonly active: ILlmStrategy;

  constructor(@Inject(LLM_STRATEGIES) strategies: ILlmStrategy[]) {
    this.strategies = new Map(strategies.map((strategy) => [strategy.name, strategy]));
    const selected = this.strategies.get(env.LLM_STRATEGY);
    if (!selected) {
      throw new Error(
        `Unknown LLM_STRATEGY "${env.LLM_STRATEGY}". Available: ${this.availableNames().join(', ')}`,
      );
    }
    this.active = selected;
  }

  get name(): string {
    return this.active.name;
  }

  get available(): string[] {
    return this.availableNames();
  }

  generate(prompt: string): Promise<string> {
    return this.active.generate(prompt);
  }

  stream(prompt: string): AsyncIterable<string> {
    return this.active.stream(prompt);
  }

  private availableNames(): string[] {
    return [...this.strategies.keys()].sort();
  }
}
