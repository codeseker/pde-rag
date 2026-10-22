export interface ILlmStrategy {
  readonly name: string;
  generate(prompt: string): Promise<string>;
  stream(prompt: string): AsyncIterable<string>;
}
