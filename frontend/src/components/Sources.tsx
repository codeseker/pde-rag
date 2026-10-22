import type { Source } from "../types";

interface SourcesProps {
  sources: Source[];
}

export function Sources({ sources }: SourcesProps) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <details className="group mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-900/80">
        <span className="flex items-center gap-2">
          Sources
          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-300 ring-1 ring-inset ring-indigo-500/25">
            {sources.length}
          </span>
        </span>
        <span
          className="text-slate-500 transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>
      <ul className="space-y-3 border-t border-slate-800 px-3 py-3">
        {sources.map((source) => (
          <li key={`${source.label}-${source.documentId}`} className="text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-300 ring-1 ring-inset ring-indigo-500/30">
                {source.label}
              </span>
              <span className="font-semibold text-slate-200">{source.title}</span>
              {source.page !== undefined ? (
                <span className="text-slate-500">p. {source.page}</span>
              ) : null}
            </div>
            {source.contentType || source.pdeCategory ? (
              <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
                {source.contentType ? <span>{source.contentType.replaceAll("_", " ")}</span> : null}
                {source.contentType && source.pdeCategory ? <span>·</span> : null}
                {source.pdeCategory ? <span>{source.pdeCategory}</span> : null}
              </div>
            ) : null}
            <p className="mt-1.5 leading-relaxed text-slate-400">{source.excerpt}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
