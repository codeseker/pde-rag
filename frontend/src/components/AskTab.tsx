import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { askStream } from "../api";
import type { ChatMessage } from "../types";
import { normalizeMath } from "../lib/normalizeMath";
import { Markdown } from "./Markdown";
import { Sources } from "./Sources";
import { VerificationBadge } from "./VerificationBadge";

const EXAMPLES = [
  "Solve the heat equation u_t = α²u_xx on 0 < x < L with zero endpoint temperatures and u(x,0) = sin(πx/L).",
  "Why are drift-diffusion and continuity equations used together in plasma process simulation?",
  "How can PINNs and neural surrogates accelerate semiconductor plasma modelling?",
];

function newId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Assistant is working">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.5" stroke="currentColor" />
      <path d="M10.75 5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5.25A1.5 1.5 0 0 0 4 10.75h1" stroke="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="m3.5 8.25 2.75 2.75 6.25-6.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AskTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const patchAssistant = (
    assistantId: string,
    update: (message: ChatMessage) => ChatMessage,
  ): void => {
    setMessages((current) =>
      current.map((message) => (message.id === assistantId ? update(message) : message)),
    );
  };

  const copyAnswer = async (message: ChatMessage): Promise<void> => {
    if (!message.content || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(normalizeMath(message.content));
      setCopiedId(message.id);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedId(null);
        copyTimerRef.current = null;
      }, 1600);
    } catch {
      setCopiedId(null);
    }
  };

  const sendQuestion = async (): Promise<void> => {
    const text = question.trim();
    if (!text || busy) {
      return;
    }

    const assistantId = newId();
    const userMessage: ChatMessage = {
      id: newId(),
      role: "user",
      content: text,
      sources: null,
      verification: null,
      pending: false,
      error: null,
    };
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      sources: null,
      verification: null,
      pending: true,
      error: null,
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setQuestion("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await askStream(
        text,
        {
          onToken: (token) => {
            patchAssistant(assistantId, (message) => ({
              ...message,
              content: message.content + token,
            }));
          },
          onSources: (sources) => {
            patchAssistant(assistantId, (message) => ({ ...message, sources }));
          },
          onDone: (verification) => {
            patchAssistant(assistantId, (message) => ({
              ...message,
              verification,
              pending: false,
            }));
          },
        },
        controller.signal,
      );
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : "Could not reach the backend.";
      patchAssistant(assistantId, (current) => ({
        ...current,
        pending: false,
        error: message,
      }));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void sendQuestion();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Ask the knowledge base</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Grounded answers with citations and a SymPy verification status.
          </p>
        </div>
        {busy ? (
          <span className="hidden rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-300 sm:inline">
            Working…
          </span>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="max-h-[62vh] min-h-[360px] space-y-5 overflow-y-auto bg-slate-950/30 px-4 py-5 sm:px-6"
      >
        {messages.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-indigo-500/30 bg-indigo-500/15 font-serif text-2xl text-indigo-300">
              Σ
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-100">Ask a PDE or plasma question</h3>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Feed PDFs or notes first. Answers use only the retrieved material and show whether the
              final PDE result passed a SymPy check.
            </p>
            <div className="mt-5 flex w-full max-w-2xl flex-col gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setQuestion(example)}
                  className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5 text-left text-xs leading-relaxed text-slate-400 transition hover:border-indigo-500/40 hover:bg-slate-800 hover:text-slate-200"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-600 px-4 py-3 text-sm leading-relaxed text-white shadow-lg shadow-indigo-950/25">
                  {message.content}
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex items-start gap-2.5">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 font-serif text-sm text-indigo-300">
                  Σ
                </div>
                <div className="min-w-0 max-w-[calc(100%-2.75rem)] rounded-2xl rounded-tl-md border border-slate-800 bg-slate-900 px-4 py-3 shadow-lg shadow-black/10">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Assistant
                    </span>
                    {message.verification ? (
                      <VerificationBadge verification={message.verification} />
                    ) : null}
                    {message.content ? (
                      <button
                        type="button"
                        onClick={() => void copyAnswer(message)}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 text-[11px] font-medium text-slate-500 transition hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200"
                        aria-label={copiedId === message.id ? "Answer copied" : "Copy answer"}
                      >
                        {copiedId === message.id ? <CheckIcon /> : <CopyIcon />}
                        {copiedId === message.id ? "Copied" : "Copy"}
                      </button>
                    ) : null}
                  </div>

                  {message.content ? <Markdown>{message.content}</Markdown> : null}
                  {message.pending && !message.content ? <TypingDots /> : null}
                  {message.pending && message.content ? (
                    <span className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-indigo-400 align-text-bottom" />
                  ) : null}

                  {message.error ? (
                    <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                      {message.error}
                    </div>
                  ) : null}

                  {message.sources ? <Sources sources={message.sources} /> : null}
                </div>
              </div>
            ),
          )
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-800 bg-slate-950/40 p-3 sm:p-4"
      >
        <div className="flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-inner shadow-black/20 transition focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Ask about a PDE, a JEE-style problem, or plasma modelling…"
            className="min-h-[48px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || question.trim().length === 0}
            className="mb-0.5 shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
          >
            {busy ? "Working" : "Send"}
          </button>
        </div>
        <p className="mt-2 px-1 text-[11px] text-slate-600">
          Enter to send · Shift+Enter for a new line. Math is rendered with KaTeX.
        </p>
      </form>
    </section>
  );
}
