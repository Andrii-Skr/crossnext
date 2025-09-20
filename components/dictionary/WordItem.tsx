"use client";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

type Def = { id: string; text_opr: string; end_date?: string | null; tags: { tag: { id: number; name: string } }[] };
export type Word = { id: string; word_text: string; opred_v: Def[] };

export function WordItem({ word }: { word: Word }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const first = word.opred_v.slice(0, 4);
  return (
    <div className="py-3 border-b">
      <button
        className="text-left w-full font-medium focus-visible:ring-2 rounded px-1"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((s) => !s)}
      >
        {word.word_text}
      </button>
      <ul id={listId} className="mt-2 grid gap-1" aria-live="polite">
        {(open ? word.opred_v : first).map((d) => (
          <li key={d.id} className="flex items-start gap-2">
            <span className="text-muted-foreground">•</span>
            <span className="min-w-0">
              {d.text_opr}
              {d.end_date ? (
                <Badge variant="secondary" className="ml-2">
                  {t("until", { value: new Date(d.end_date).toLocaleDateString() })}
                </Badge>
              ) : null}
              {d.tags.length > 0 && (
                <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                  {d.tags.map((t) => (
                    <Badge key={t.tag.id} variant="outline">
                      <span className="mb-1 h-3">{t.tag.name}</span>
                    </Badge>
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}
        {!open && word.opred_v.length > first.length && (
          <li className="text-xs text-muted-foreground">{t("moreCount", { count: word.opred_v.length - first.length })}</li>
        )}
      </ul>
    </div>
  );
}
