import {
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { feedPdf, feedText } from "../api";
import type { FeedResult } from "../types";
import { Markdown } from "./Markdown";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The feed request failed.";
}

export function FeedTab() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FeedResult | null>(null);

  const uploadPdf = async (file: File): Promise<void> => {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Choose a PDF file.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await feedPdf(file));
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      void uploadPdf(file);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void uploadPdf(file);
    }
  };

  const handleTextSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanText = text.trim();
    if (!cleanTitle) {
      setError("Add a title for this note.");
      return;
    }
    if (cleanText.length < 20) {
      setError("Add at least 20 characters of text.");
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await feedText(cleanTitle, cleanText));
      setTitle("");
      setText("");
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-black/10">
          <h2 className="text-sm font-semibold text-slate-100">Upload a PDF</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Text is extracted page by page. Equation blocks and question–solution pairs are kept
            together while chunking.
          </p>

          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`mt-4 flex min-h-[250px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-8 text-center transition ${
              dragging
                ? "border-indigo-500 bg-indigo-500/10"
                : "border-slate-700 bg-slate-950/40 hover:border-indigo-500/50 hover:bg-slate-900"
            } ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              className="sr-only"
              disabled={busy}
            />
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-slate-700 bg-slate-800 text-lg text-indigo-300 shadow-sm">
              ↑
            </div>
            <div className="mt-3 text-sm font-semibold text-slate-200">
              {busy ? "Processing…" : "Drop a PDF here"}
            </div>
            <div className="mt-1 text-xs text-slate-500">or click to choose a file · max 25 MB</div>
          </label>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            PDF chunks are searchable context. Use the text box for trusted notes that must always
            be included (pinned context).
          </p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-black/10">
          <h2 className="text-sm font-semibold text-slate-100">Add notes as pinned context</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Pasted text is always prepended to retrieval results. Use{" "}
            <code className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-[11px] text-indigo-200">
              $...$
            </code>{" "}
            for inline math and{" "}
            <code className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-[11px] text-indigo-200">
              $$...$$
            </code>{" "}
            for display math.
          </p>

          <form onSubmit={(event) => void handleTextSubmit(event)} className="mt-4 space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title, e.g. Heat equation — course notes"
              maxLength={200}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              disabled={busy}
            />

            <div className="grid gap-3 lg:grid-cols-2">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={11}
                placeholder={"Paste notes, a solved example, or reference material…\n\nThe heat equation is $u_t = \\alpha^2 u_{xx}$."}
                className="min-h-[220px] w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                disabled={busy}
              />

              <div className="min-h-[220px] overflow-auto rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Live preview
                </div>
                {text.trim() ? (
                  <Markdown>{text}</Markdown>
                ) : (
                  <p className="text-xs text-slate-600">
                    Rendered markdown and KaTeX preview appears here.
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {busy ? "Adding knowledge…" : "Add pinned notes"}
            </button>
          </form>
        </section>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <span className="font-semibold">
            {result.chunks === 0
              ? "No new chunks added."
              : `Added ${result.chunks} chunk${result.chunks === 1 ? "" : "s"}.`}
          </span>{" "}
          {result.chunks === 0
            ? "These chunks already exist in the knowledge base."
            : "The knowledge is now available to the ask flow."}{" "}
          <span className="text-xs text-emerald-400/70">
            Document {result.documentId.slice(0, 8)}…
          </span>
        </div>
      ) : null}
    </div>
  );
}
