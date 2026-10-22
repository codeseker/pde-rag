import { Injectable } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { env } from '../../config/env';
import type { ILlmStrategy } from '../interfaces/llm-strategy.interface';
import { messageContentToText } from '../message-content';

@Injectable()
export class GroqLlmStrategy implements ILlmStrategy {
  readonly name = 'groq';
  private readonly model: ChatGroq;

  constructor() {
    this.model = new ChatGroq({
      apiKey: env.GROQ_API_KEY?.trim() || 'missing-groq-api-key',
      model: env.GROQ_LLM_MODEL,
      temperature: 0,
      maxTokens: env.GROQ_MAX_OUTPUT_TOKENS,
      maxRetries: 0,
    });
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.model.invoke(prompt);
    return messageContentToText(response.content);
  }

  async *stream(prompt: string): AsyncGenerator<string> {
    const response = await this.model.stream(prompt);
    for await (const chunk of response) {
      const text = messageContentToText(chunk.content);
      if (text) {
        yield text;
      }
    }
  }
}
