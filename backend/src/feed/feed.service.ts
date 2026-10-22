import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { env } from '../config/env';
import { ChunkRepository, type InsertChunk } from '../database/chunk.repository';
import { EmbeddingContext } from '../models/embedding.context';
import { chunkPages } from './chunker';
import { loadPdfPages, type LoadedPage } from './pdf.loader';

export interface UploadedPdf {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const TextFeedSchema = z.object({
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(20, 'text must contain at least 20 characters').max(2_000_000),
});

const FileFeedSchema = z.object({
  title: z.string().trim().max(200).optional(),
});

const EMBED_BATCH_SIZE = 64;

@Injectable()
export class FeedService {
  constructor(
    private readonly repository: ChunkRepository,
    private readonly embeddings: EmbeddingContext,
  ) {}

  async ingest(file: UploadedPdf | undefined, body: unknown): Promise<{
    documentId: string;
    chunks: number;
  }> {
    if (file) {
      return this.ingestPdf(file, body);
    }
    return this.ingestText(body);
  }

  private async ingestText(body: unknown): Promise<{ documentId: string; chunks: number }> {
    const parsed = TextFeedSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'Send either a PDF field named "file" or JSON {"title": "...", "text": "..."}.',
      );
    }

    const pages: LoadedPage[] = [{ page: 1, text: parsed.data.text }];
    return this.save(parsed.data.title, 'text', pages, true);
  }

  private async ingestPdf(
    file: UploadedPdf,
    body: unknown,
  ): Promise<{ documentId: string; chunks: number }> {
    const isPdf =
      file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      throw new BadRequestException('The uploaded file must be a PDF.');
    }
    if (file.size === 0) {
      throw new BadRequestException('The uploaded PDF is empty.');
    }

    const parsedMeta = FileFeedSchema.safeParse(body);
    const suppliedTitle =
      parsedMeta.success && parsedMeta.data.title ? parsedMeta.data.title.trim() : '';
    const title =
      suppliedTitle ||
      file.originalname.replace(/\.pdf$/i, '').trim() ||
      'Untitled PDF';

    let pages: LoadedPage[];
    try {
      pages = await loadPdfPages(file.buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Could not parse PDF: ${message}`);
    }

    if (!pages.some((page) => page.text.trim())) {
      throw new BadRequestException('The PDF contains no extractable text.');
    }

    return this.save(title, 'pdf', pages, false);
  }

  private async save(
    title: string,
    sourceType: 'pdf' | 'text',
    pages: LoadedPage[],
    pinned: boolean,
  ): Promise<{ documentId: string; chunks: number }> {
    const drafts = await chunkPages(pages, {
      chunkSize: env.CHUNK_SIZE,
      chunkOverlap: env.CHUNK_OVERLAP,
      pinned,
    });

    if (drafts.length === 0) {
      throw new BadRequestException('No text chunks could be extracted from the input.');
    }

    const newDrafts: typeof drafts = [];
    for (const draft of drafts) {
      if (!(await this.repository.existsByHash(draft.contentHash))) {
        newDrafts.push(draft);
      }
    }

    if (newDrafts.length === 0) {
      const result = await this.repository.insert({
        title,
        sourceType,
        embeddingModel: this.embeddings.name,
        chunks: [],
      });
      return { documentId: result.documentId, chunks: 0 };
    }

    const vectors = await this.embedInBatches(newDrafts.map((draft) => draft.content));
    const rows: InsertChunk[] = newDrafts.map((draft, index) => ({
      content: draft.content,
      contentHash: draft.contentHash,
      metadata: draft.metadata,
      embedding: vectors[index] ?? [],
      embeddingModel: this.embeddings.name,
    }));

    const result = await this.repository.insert({
      title,
      sourceType,
      embeddingModel: this.embeddings.name,
      chunks: rows,
    });
    return { documentId: result.documentId, chunks: result.inserted };
  }

  private async embedInBatches(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let index = 0; index < texts.length; index += EMBED_BATCH_SIZE) {
      const batch = texts.slice(index, index + EMBED_BATCH_SIZE);
      vectors.push(...(await this.embeddings.embed(batch)));
    }
    return vectors;
  }
}
