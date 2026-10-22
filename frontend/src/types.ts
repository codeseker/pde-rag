export type Verification = "verified" | "failed" | "inconclusive" | "not_applicable";

export interface Source {
  label: string;
  documentId: string;
  title: string;
  page?: number;
  contentType?: string;
  pdeCategory?: string;
  excerpt: string;
}

export interface AskResult {
  answer: string;
  sources: Source[];
  verification: Verification;
}

export interface FeedResult {
  documentId: string;
  chunks: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[] | null;
  verification: Verification | null;
  pending: boolean;
  error: string | null;
}
