"use client";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useClientTimeZone } from "@/lib/date";

type Def = {
  id: string;
  text_opr: string;
  difficulty?: number | null;
  end_date?: string | null;
  is_pending_edit?: boolean;
  tags: { tag: { id: number; name: string } }[];
};
export type Word = { id: string; word_text: string; is_pending_edit?: boolean; opred_v: Def[] };

export function WordItem({ word }: { word: Word }) {
  const t = useTranslations();
  const f = useFormatter();
  const timeZone = useClientTimeZone();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const first = word.opred_v.slice(0, 4);
  return (
    <div className="py-3 border-b">
      <Button
        className="text-left w-full font-medium focus-visible:ring-2 rounded px-1"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((s) => !s)}
      >
        {word.word_text}
      </Button>
      <ul id={listId} className="mt-2 grid gap-1" aria-live="polite">
        {(open ? word.opred_v : first).map((d) => (
          <li key={d.id} className="flex items-start gap-2">
            <span className="text-muted-foreground">•</span>
            <span className="min-w-0">
              {d.text_opr}
              {d.end_date ? (
                <Badge variant="secondary" className="ml-2">
                  {t("until", {
                    value: f.dateTime(new Date(d.end_date), {
                      dateStyle: "short",
                      timeZone,
                    }),
                  })}
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
          <li className="text-xs text-muted-foreground">
            {t("moreCount", { count: word.opred_v.length - first.length })}
          </li>
        )}
      </ul>
    </div>
  );
}
