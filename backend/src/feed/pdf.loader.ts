import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

export interface LoadedPage {
  page: number;
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function loadPdfPages(buffer: Buffer): Promise<LoadedPage[]> {
  const bytes = new Uint8Array(buffer);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const documents = await new PDFLoader(blob, { splitPages: true }).load();

  return documents.map((document, index) => {
    const loc = document.metadata['loc'];
    const page =
      isRecord(loc) && typeof loc['pageNumber'] === 'number' ? loc['pageNumber'] : index + 1;
    return { page, text: document.pageContent };
  });
}
