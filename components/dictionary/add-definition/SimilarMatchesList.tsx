"use client";
import { useTranslations } from "next-intl";

export type SimilarItem = {
  id: string | number;
  text: string;
  percent: number;
  kind: "duplicate" | "similar";
};

export function SimilarMatchesList({ items, threshold }: { items: SimilarItem[]; threshold: number }) {
  const t = useTranslations();
  if (!items.length) return null;
  return (
    <div className="mt-1 rounded-md border bg-accent/20 p-2 text-xs">
      <div className="mb-1 font-medium">{t("similarDefsTitle", { percent: threshold })}</div>
      <ul className="grid gap-1">
        {items.map((m) => (
          <li key={m.id} className="flex items-start gap-2">
            <span className="shrink-0 min-w-12 font-mono tabular-nums">{m.percent.toFixed(2)}%</span>
            <span className="inline-block rounded px-1 py-0.5 text-[10px] uppercase tracking-wide bg-secondary text-secondary-foreground">
              {m.kind === "duplicate"
                ? t("similarDefsDuplicate", { default: "duplicate" })
                : t("similarDefsSimilar", { default: "similar" })}
            </span>
            <span className="flex-1 break-words">{m.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
