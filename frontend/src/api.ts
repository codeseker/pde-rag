import type { FeedResult, Source, Verification } from "./types";

// Production is served from Render. The build in the root Dockerfile sets this
// value explicitly; the fallback keeps a production build from ever silently
// pointing at localhost if the build arg is omitted.
const PRODUCTION_API_BASE = "https://pde-rag.onrender.com";
const configuredApiBase = import.meta.env.VITE_API_URL?.trim() ?? "";
const fallbackApiBase = import.meta.env.PROD ? PRODUCTION_API_BASE : "http://localhost:3000";

export const API_BASE = (configuredApiBase || fallbackApiBase).replace(/\/+$/, "");

/** Joins the configured API base and a path without duplicate slashes. */
export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

export interface AskStreamHandlers {
  onToken: (text: string) => void;
  onSources: (sources: Source[]) => void;
  onDone: (verification: Verification) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body)) {
      const message = body["message"];
      if (typeof message === "string") {
        return message;
      }
      if (Array.isArray(message)) {
        return message.filter((item): item is string => typeof item === "string").join("; ");
      }
    }
  } catch {
    // Fall through to the status-based message.
  }
  if (response.status === 502) {
    return "The API upstream is unavailable (HTTP 502). Check /health and the Render logs.";
  }
  if (response.status === 503) {
    return "The API is temporarily unavailable (HTTP 503). Please retry shortly.";
  }
  return `Request failed with HTTP ${response.status}.`;
}

function parseVerification(value: unknown): Verification | null {
  return value === "verified" ||
    value === "failed" ||
    value === "inconclusive" ||
    value === "not_applicable"
    ? value
    : null;
}

function parseSource(value: unknown): Source | null {
  if (!isRecord(value)) {
    return null;
  }
  const label = value["label"];
  const documentId = value["documentId"];
  const title = value["title"];
  const excerpt = value["excerpt"];
  if (
    typeof label !== "string" ||
    typeof documentId !== "string" ||
    typeof title !== "string" ||
    typeof excerpt !== "string"
  ) {
    return null;
  }

  const source: Source = { label, documentId, title, excerpt };
  const page = value["page"];
  const contentType = value["contentType"];
  const pdeCategory = value["pdeCategory"];
  if (typeof page === "number") {
    source.page = page;
  }
  if (typeof contentType === "string") {
    source.contentType = contentType;
  }
  if (typeof pdeCategory === "string") {
    source.pdeCategory = pdeCategory;
  }
  return source;
}

function parseSources(value: unknown): Source[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(parseSource)
    .filter((source): source is Source => source !== null);
}

function parseFeedResult(value: unknown): FeedResult {
  if (
    !isRecord(value) ||
    typeof value["documentId"] !== "string" ||
    typeof value["chunks"] !== "number"
  ) {
    throw new Error("The feed endpoint returned an unexpected response.");
  }
  return { documentId: value["documentId"], chunks: value["chunks"] };
}

export async function feedText(title: string, text: string): Promise<FeedResult> {
  const response = await fetch(apiUrl("/feed"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ title, text }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return parseFeedResult(await response.json());
}

export async function feedPdf(file: File): Promise<FeedResult> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(apiUrl("/feed"), {
    method: "POST",
    headers: { Accept: "application/json" },
    body,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return parseFeedResult(await response.json());
}

export async function askStream(
  question: string,
  handlers: AskStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(apiUrl("/ask"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ question }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  if (!response.body) {
    throw new Error("Streaming responses are not supported by this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const handleEvent = (event: string): void => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (!isRecord(payload) || typeof payload["type"] !== "string") {
      return;
    }

    switch (payload["type"]) {
      case "token": {
        const text = payload["text"];
        if (typeof text === "string") {
          handlers.onToken(text);
        }
        break;
      }
      case "sources": {
        handlers.onSources(parseSources(payload["sources"]));
        break;
      }
      case "done": {
        const verification = parseVerification(payload["verification"]);
        if (verification) {
          completed = true;
          handlers.onDone(verification);
        }
        break;
      }
      case "error": {
        const message = payload["message"];
        throw new Error(typeof message === "string" ? message : "The answer stream failed.");
      }
      default:
        break;
    }
  };

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    buffer += decoder.decode(result.value, { stream: true });

    let boundary = buffer.match(/\r?\n\r?\n/);
    while (boundary?.index !== undefined) {
      const event = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      handleEvent(event);
      boundary = buffer.match(/\r?\n\r?\n/);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    handleEvent(buffer);
  }
  if (!completed) {
    throw new Error("The answer stream ended before completion.");
  }
}
