import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { env } from '../../config/env';
import type { ILlmStrategy } from '../interfaces/llm-strategy.interface';
import { messageContentToText } from '../message-content';

@Injectable()
export class OpenAiLlmStrategy implements ILlmStrategy {
  readonly name = 'openai';
  private readonly model: ChatOpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      apiKey: env.OPENAI_API_KEY?.trim() || 'missing-openai-api-key',
      model: env.OPENAI_LLM_MODEL,
      temperature: 0,
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
