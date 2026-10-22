import { createHash } from 'node:crypto';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { ChunkMetadata } from '../database/schema';
import type { LoadedPage } from './pdf.loader';
import { buildMetadata } from './metadata';

export interface ChunkDraft {
  content: string;
  contentHash: string;
  metadata: ChunkMetadata;
}

const QA_BLOCK =
  /(?:^|\n)[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?\b(?:Question|Problem|Exercise|Example)\b(?:\*\*)?[\s\S]*?(?=\n[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?\b(?:Question|Problem|Exercise|Example)\b|$)/gi;

const EQUATION_BLOCK =
  /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{(?:equation|align|gather)\*?\}[\s\S]*?\\end\{(?:equation|align|gather)\*?\}/g;

function maskText(text: string): { masked: string; blocks: string[] } {
  const blocks: string[] = [];

  const mask = (value: string): string => {
    const token = `⟦PDE_BLOCK_${blocks.length}⟧`;
    blocks.push(value);
    return token;
  };

  // A question and its worked solution become one indivisible block.
  let masked = text.replace(QA_BLOCK, (block) => {
    return /\bsolution\b|\banswer\b|\bhence\b|\btherefore\b/i.test(block)
      ? mask(block)
      : block;
  });

  // Equations outside a Q/A block are protected separately.
  masked = masked.replace(EQUATION_BLOCK, (block) => mask(block));

  return { masked, blocks };
}

function unmaskText(text: string, blocks: string[]): string {
  return text.replace(/⟦PDE_BLOCK_(\d+)⟧/g, (_match, index: string) => {
    return blocks[Number(index)] ?? '';
  });
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function chunkPages(
  pages: LoadedPage[],
  options: {
    chunkSize: number;
    chunkOverlap: number;
    pinned: boolean;
  },
): Promise<ChunkDraft[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options.chunkSize,
    chunkOverlap: options.chunkOverlap,
  });

  const chunks: ChunkDraft[] = [];
  const seenHashes = new Set<string>();

  for (const page of pages) {
    const { masked, blocks } = maskText(page.text);
    const split = await splitter.splitText(masked);

    for (const piece of split) {
      const content = unmaskText(piece, blocks).trim();
      if (!content) {
        continue;
      }
      const contentHash = hashContent(content);
      if (seenHashes.has(contentHash)) {
        continue;
      }
      seenHashes.add(contentHash);
      chunks.push({
        content,
        contentHash,
        metadata: buildMetadata(content, page.page, options.pinned),
      });
    }
  }

  return chunks;
}
