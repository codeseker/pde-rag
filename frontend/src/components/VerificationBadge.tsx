import type { Verification } from "../types";

const LABELS: Record<Verification, string> = {
  verified: "Verified",
  failed: "Failed",
  inconclusive: "Inconclusive",
  not_applicable: "No math check",
};

const STYLES: Record<Verification, string> = {
  verified: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  inconclusive: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  not_applicable: "border-slate-700 bg-slate-800/60 text-slate-400",
};

interface VerificationBadgeProps {
  verification: Verification;
}

export function VerificationBadge({ verification }: VerificationBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${STYLES[verification]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {LABELS[verification]}
    </span>
  );
}
