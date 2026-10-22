import { resolve } from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

// Works from both backend/ and the repository root.
config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '..', '.env') });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    MIGRATION_DATABASE_URL: z.string().min(1).optional(),
    LLM_STRATEGY: z.string().min(1).default('groq'),
    EMBEDDING_STRATEGY: z.string().min(1).default('gemini'),
    GROQ_API_KEY: z.string().optional(),
    GROQ_LLM_MODEL: z.string().min(1).default('openai/gpt-oss-120b'),
    GROQ_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(8192).default(4096),
    GOOGLE_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_EMBEDDING_MODEL: z.string().min(1).default('gemini-embedding-001'),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_LLM_MODEL: z.string().min(1).default('gpt-4o-mini'),
    OPENAI_EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),
    OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
    OLLAMA_LLM_MODEL: z.string().min(1).default('llama3.1'),
    OLLAMA_EMBEDDING_MODEL: z.string().min(1).default('bge-m3'),
    CHUNK_SIZE: z.coerce.number().int().positive().default(600),
    CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(100),
    TOP_K: z.coerce.number().int().positive().max(50).default(3),
    MAX_CONTEXT_CHARS: z.coerce.number().int().positive().default(6000),
    VERIFIER_URL: z.string().url().default('http://localhost:8000'),
    // Database startup/retry tuning. The API starts listening even if the
    // database is temporarily unreachable; /health reports 503 until it is.
    DB_MIGRATION_ATTEMPTS: z.coerce.number().int().positive().max(100).default(5),
    DB_MIGRATION_RETRY_MS: z.coerce.number().int().positive().max(60_000).default(2000),
    DB_BACKGROUND_RETRY_MS: z.coerce.number().int().positive().max(300_000).default(15_000),
    DB_HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().max(30_000).default(3000),
  })
  .superRefine((value, ctx) => {
    if (value.CHUNK_OVERLAP >= value.CHUNK_SIZE) {
      ctx.addIssue({
        code: 'custom',
        path: ['CHUNK_OVERLAP'],
        message: 'CHUNK_OVERLAP must be smaller than CHUNK_SIZE',
      });
    }
  });

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
