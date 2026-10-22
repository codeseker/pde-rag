import { Module } from '@nestjs/common';
import { EmbeddingContext } from './embedding.context';
import type { IEmbeddingStrategy } from './interfaces/embedding-strategy.interface';
import type { ILlmStrategy } from './interfaces/llm-strategy.interface';
import { LlmContext } from './llm.context';
import { GeminiEmbeddingStrategy } from './strategies/gemini-embedding.strategy';
import { GroqLlmStrategy } from './strategies/groq-llm.strategy';
import { OllamaEmbeddingStrategy } from './strategies/ollama-embedding.strategy';
import { OllamaLlmStrategy } from './strategies/ollama-llm.strategy';
import { OpenAiEmbeddingStrategy } from './strategies/openai-embedding.strategy';
import { OpenAiLlmStrategy } from './strategies/openai-llm.strategy';
import { EMBEDDING_STRATEGIES, LLM_STRATEGIES, MATH_VERIFIER } from './tokens';
import { VerifierClient } from './verifier.client';

// Adding a provider model is one new class plus one entry in the relevant array.
const LLM_STRATEGY_CLASSES = [GroqLlmStrategy, OpenAiLlmStrategy, OllamaLlmStrategy];
const EMBEDDING_STRATEGY_CLASSES = [
  GeminiEmbeddingStrategy,
  OpenAiEmbeddingStrategy,
  OllamaEmbeddingStrategy,
];

@Module({
  providers: [
    ...LLM_STRATEGY_CLASSES,
    ...EMBEDDING_STRATEGY_CLASSES,
    {
      provide: LLM_STRATEGIES,
      inject: [...LLM_STRATEGY_CLASSES],
      useFactory: (...strategies: ILlmStrategy[]): ILlmStrategy[] => strategies,
    },
    {
      provide: EMBEDDING_STRATEGIES,
      inject: [...EMBEDDING_STRATEGY_CLASSES],
      useFactory: (...strategies: IEmbeddingStrategy[]): IEmbeddingStrategy[] => strategies,
    },
    LlmContext,
    EmbeddingContext,
    VerifierClient,
    {
      provide: MATH_VERIFIER,
      useExisting: VerifierClient,
    },
  ],
  exports: [LlmContext, EmbeddingContext, MATH_VERIFIER],
})
export class ModelsModule {}
