import { useState } from "react";
import { AskTab } from "./components/AskTab";
import { FeedTab } from "./components/FeedTab";

type Tab = "ask" | "feed";

export default function App() {
  const [tab, setTab] = useState<Tab>("ask");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-indigo-500/30 bg-indigo-500/15 font-serif text-xl text-indigo-300 shadow-sm shadow-indigo-950/50">
              Σ
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-slate-100">PDE RAG</h1>
              <p className="text-xs text-slate-500">
                PDE solutions · plasma modelling · semiconductor applications
              </p>
            </div>
          </div>

          <nav
            aria-label="Main sections"
            className="flex rounded-xl border border-slate-800 bg-slate-900 p-1"
          >
            <button
              type="button"
              onClick={() => setTab("ask")}
              aria-pressed={tab === "ask"}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                tab === "ask"
                  ? "bg-slate-800 text-white shadow-sm shadow-black/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Ask
            </button>
            <button
              type="button"
              onClick={() => setTab("feed")}
              aria-pressed={tab === "feed"}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                tab === "feed"
                  ? "bg-slate-800 text-white shadow-sm shadow-black/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Feed knowledge
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className={tab === "ask" ? "" : "hidden"}>
          <AskTab />
        </div>
        <div className={tab === "feed" ? "" : "hidden"}>
          <FeedTab />
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-[11px] text-slate-600 sm:px-6">
        Answers are grounded in fed sources. PDE results are checked with SymPy when a
        machine-readable form is available.
      </footer>
    </div>
  );
}
