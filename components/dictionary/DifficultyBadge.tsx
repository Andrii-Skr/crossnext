"use client";

import { Gauge } from "lucide-react";

export function DifficultyBadge({ value, label }: { value?: number | null; label: string }) {
  const normalized = Number.isFinite(value as number) ? Math.max(0, Math.trunc(value as number)) : 1;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold leading-none text-emerald-900 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-100 dark:ring-emerald-500/40"
      title={`${label} ${normalized}`}
    >
      <Gauge className="size-3" aria-hidden />
      <span className="sr-only">{label}</span>
      <span>{normalized}</span>
    </span>
  );
}
