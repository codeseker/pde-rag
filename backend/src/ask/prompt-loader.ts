import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PromptSet {
  classify: string;
  solve: string;
  plasma: string;
}

function readPrompt(name: string): string {
  return readFileSync(join(__dirname, 'prompts', name), 'utf8');
}

export function loadPrompts(): PromptSet {
  return {
    classify: readPrompt('classify.txt'),
    solve: readPrompt('solve.txt'),
    plasma: readPrompt('plasma.txt'),
  };
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
