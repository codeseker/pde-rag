import { ConflictException, Injectable } from '@nestjs/common';
import { and, cosineDistance, eq, sql } from 'drizzle-orm';
import { db } from '../database/client';
import {
  chunks,
  documents,
  type ChunkMetadata,
  type NewChunkRow,
  type SourceType,
} from '../database/schema';

export interface RetrievedChunk {
  id: string;
  documentId: string;
  title: string;
  content: string;
  metadata: ChunkMetadata;
  distance: number | null;
}

export interface InsertChunk {
  content: string;
  embedding: number[];
  contentHash: string;
  metadata: ChunkMetadata;
  embeddingModel: string;
}

export interface InsertResult {
  documentId: string;
  inserted: number;
}

@Injectable()
export class ChunkRepository {
  async insert(input: {
    title: string;
    sourceType: SourceType;
    embeddingModel: string;
    chunks: InsertChunk[];
  }): Promise<InsertResult> {
    await this.assertEmbeddingModel(input.embeddingModel);

    return db.transaction(async (tx) => {
      const insertedDocs = await tx
        .insert(documents)
        .values({ title: input.title, sourceType: input.sourceType })
        .returning({ id: documents.id });

      const document = insertedDocs[0];
      if (!document) {
        throw new Error('Failed to create document');
      }

      if (input.chunks.length === 0) {
        return { documentId: document.id, inserted: 0 };
      }

      const rows: NewChunkRow[] = input.chunks.map((chunk) => ({
        documentId: document.id,
        content: chunk.content,
        embedding: chunk.embedding,
        contentHash: chunk.contentHash,
        metadata: chunk.metadata,
        embeddingModel: chunk.embeddingModel,
      }));

      const insertedChunks = await tx
        .insert(chunks)
        .values(rows)
        .onConflictDoNothing({ target: chunks.contentHash })
        .returning({ id: chunks.id });

      return { documentId: document.id, inserted: insertedChunks.length };
    });
  }

  async existsByHash(contentHash: string): Promise<boolean> {
    const rows = await db
      .select({ id: chunks.id })
      .from(chunks)
      .where(eq(chunks.contentHash, contentHash))
      .limit(1);
    return rows.length > 0;
  }

  async similaritySearch(
    embedding: number[],
    embeddingModel: string,
    limit: number,
  ): Promise<RetrievedChunk[]> {
    await this.assertEmbeddingModel(embeddingModel);

    const pinned = sql<boolean>`coalesce((${chunks.metadata} ->> 'pinned')::boolean, false) = true`;

    const pinnedRows = await db
      .select({
        id: chunks.id,
        documentId: chunks.documentId,
        title: documents.title,
        content: chunks.content,
        metadata: chunks.metadata,
      })
      .from(chunks)
      .innerJoin(documents, eq(documents.id, chunks.documentId))
      .where(and(eq(chunks.embeddingModel, embeddingModel), pinned))
      .limit(limit);

    const rankedRows = await db
      .select({
        id: chunks.id,
        documentId: chunks.documentId,
        title: documents.title,
        content: chunks.content,
        metadata: chunks.metadata,
        distance: cosineDistance(chunks.embedding, embedding),
      })
      .from(chunks)
      .innerJoin(documents, eq(documents.id, chunks.documentId))
      .where(eq(chunks.embeddingModel, embeddingModel))
      .orderBy(cosineDistance(chunks.embedding, embedding))
      .limit(limit);

    const seen = new Set<string>();
    const result: RetrievedChunk[] = [];

    for (const row of pinnedRows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        result.push({ ...row, distance: null });
      }
    }
    for (const row of rankedRows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        result.push({
          ...row,
          distance: typeof row.distance === 'number' ? row.distance : Number(row.distance),
        });
      }
    }

    return result;
  }

  private async assertEmbeddingModel(expected: string | null): Promise<void> {
    if (!expected) {
      return;
    }
    const rows = await db
      .selectDistinct({ embeddingModel: chunks.embeddingModel })
      .from(chunks)
      .limit(2);
    const models = rows.map((row) => row.embeddingModel);
    const mismatch = models.filter((model) => model !== expected);
    if (mismatch.length > 0) {
      throw new ConflictException(
        `Embedding model mismatch: existing chunks use [${models.join(', ')}], but the active strategy is "${expected}". Reset the database (or delete existing chunks) before switching embedding strategy.`,
      );
    }
  }
}
