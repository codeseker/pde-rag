import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { env } from '../../config/env';
import type { ILlmStrategy } from '../interfaces/llm-strategy.interface';
import { messageContentToText } from '../message-content';

@Injectable()
export class OllamaLlmStrategy implements ILlmStrategy {
  readonly name = 'ollama';
  private readonly model: ChatOllama;

  constructor() {
    this.model = new ChatOllama({
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_LLM_MODEL,
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
