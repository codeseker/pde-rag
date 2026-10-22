import type { z } from 'zod';

export function parseJsonObject<T>(raw: string, schema: z.ZodType<T>): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? raw).trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Model response did not contain a JSON object');
  }
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  return schema.parse(parsed);
}
