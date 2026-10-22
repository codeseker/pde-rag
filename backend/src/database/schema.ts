import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';

/**
 * Both embedding strategies are configured for 1024 dimensions:
 * - OpenAI text-embedding-3-small with dimensions: 1024
 * - Ollama bge-m3 (1024 native)
 * Changing this number requires a new Drizzle migration.
 */
export const VECTOR_DIMENSIONS = 1024;

export type SourceType = 'pdf' | 'text';
export type ContentType = 'theory' | 'solved_example' | 'jee_question' | 'plasma_application';

export interface ChunkMetadata {
  page?: number;
  contentType?: ContentType;
  pdeCategory?: string;
  pinned?: boolean;
}

export const sourceTypeEnum = pgEnum('document_source_type', ['pdf', 'text']);

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  sourceType: sourceTypeEnum('source_type').$type<SourceType>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: VECTOR_DIMENSIONS }).notNull(),
    contentHash: text('content_hash').notNull().unique(),
    metadata: jsonb('metadata').$type<ChunkMetadata>().notNull().default({}),
    embeddingModel: text('embedding_model').notNull(),
  },
  (table) => [
    index('chunks_embedding_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('chunks_document_id_idx').on(table.documentId),
  ],
);

export type DocumentRow = typeof documents.$inferSelect;
export type ChunkRow = typeof chunks.$inferSelect;
export type NewChunkRow = typeof chunks.$inferInsert;
