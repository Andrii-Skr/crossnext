"use client";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";

type Def = { id: string; text_opr: string; tags: { tag: { id: number; name: string } }[] };
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
            <span>
              {d.text_opr}
              {d.tags.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {d.tags.map((t) => t.tag.name).join(", ")}
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
