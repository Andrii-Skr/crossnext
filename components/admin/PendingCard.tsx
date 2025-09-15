"use client";
import { useMemo, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PendingActions } from "@/components/PendingActions";

type Description = {
  id: string;
  description: string;
  difficulty?: number | null;
  createdAt: string; // ISO
  note?: string | null;
};

export function PendingCard({
  pending,
  tagNames,
  saveAction,
  approveAction,
  rejectAction,
}: {
  pending: {
    id: string;
    word_text: string;
    langCode?: string | null;
    langName?: string | null;
    targetWordId?: string | null;
    descriptions: Description[];
  };
  tagNames: Record<string, string>;
  saveAction: (formData: FormData) => Promise<void>;
  approveAction: (formData: FormData) => Promise<void>;
  rejectAction: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations();
  const f = useFormatter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const items = pending.descriptions;

  // Helpers to parse tags from note once per description
  const tagsByDesc = useMemo(() => {
    const out = new Map<string, number[]>();
    for (const d of items) {
      const arr: number[] = [];
      if (d.note) {
        try {
          const parsed = JSON.parse(d.note) as unknown;
          if (parsed && typeof parsed === "object") {
            const obj = parsed as { tags?: unknown };
            if (Array.isArray(obj.tags)) {
              for (const x of obj.tags)
                if (typeof x === "number" && Number.isInteger(x)) arr.push(x);
            }
          }
        } catch {}
      }
      out.set(d.id, arr);
    }
    return out;
  }, [items]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="truncate">{pending.word_text}</span>
          <div className="flex items-center gap-2">
            <Badge>{pending.langName ?? pending.langCode ?? ""}</Badge>
            {pending.targetWordId ? (
              <Badge variant="outline">{t("pendingExisting", { id: pending.targetWordId })}</Badge>
            ) : (
              <Badge variant="outline">{t("pendingNewWord")}</Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {editing ? (
          <form
            id={`edit-${pending.id}`}
            action={(fd) =>
              startTransition(async () => {
                await saveAction(fd);
                setEditing(false);
              })
            }
            className="space-y-3"
          >
            <input type="hidden" name="id" value={pending.id} />
            {!pending.targetWordId && (
              <div className="mb-2">
                <span className="text-xs text-muted-foreground mr-2">{t("word")}</span>
                <Input name="word" defaultValue={pending.word_text} />
              </div>
            )}
            {items.map((d, idx) => (
              <div key={d.id} className="rounded-md border p-3">
                <textarea
                  name={`desc_text_${d.id}`}
                  defaultValue={d.description}
                  className="w-full min-h-12 rounded border bg-background px-2 py-1 text-sm"
                />
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{t("difficultyFilterLabel")}</span>
                  <input type="hidden" name={`desc_diff_${d.id}`} defaultValue={String(d.difficulty ?? 1)} />
                  <Select
                    defaultValue={String(d.difficulty ?? 1)}
                    onValueChange={(v) => {
                      const el = document.querySelector(
                        `input[name=\\"desc_diff_${d.id}\\"]`,
                      ) as HTMLInputElement | null;
                      if (el) el.value = v;
                    }}
                  >
                    <SelectTrigger className="h-7 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {idx === 0 && (
                    <>
                      <span className="ml-4 text-muted-foreground">{t("language")}</span>
                      <input type="hidden" name="language" defaultValue={pending.langCode ?? "ru"} />
                      <Select
                        defaultValue={pending.langCode ?? "ru"}
                        onValueChange={(v) => {
                          const el = document.querySelector(
                            `input[name=\\"language\\"]`,
                          ) as HTMLInputElement | null;
                          if (el) el.value = v;
                        }}
                      >
                        <SelectTrigger className="h-7 w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ru">ru</SelectItem>
                          <SelectItem value="uk">uk</SelectItem>
                          <SelectItem value="en">en</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>
                {tagsByDesc.get(d.id)?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tagsByDesc.get(d.id)!.map((id) => (
                      <Badge key={id} variant="outline">
                        <span className="mb-1 h-3">{tagNames[String(id)] ?? String(id)}</span>
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {t("pendingCreatedAt", {
                    value: f.dateTime(new Date(d.createdAt), {
                      dateStyle: "short",
                      timeStyle: "short",
                    }),
                  })}
                </div>
              </div>
            ))}
          </form>
        ) : (
          <div className="space-y-3">
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("pendingNoDescriptions")}</p>
            )}
            {items.map((d) => (
              <div key={d.id} className="rounded-md border p-3">
                <div className="text-sm whitespace-pre-wrap break-words">{d.description}</div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{t("difficultyFilterLabel")}</span>
                  <Badge variant="outline">{d.difficulty ?? 1}</Badge>
                </div>
                {tagsByDesc.get(d.id)?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tagsByDesc.get(d.id)!.map((id) => (
                      <Badge key={id} variant="outline">
                        <span className="mb-1 h-3">{tagNames[String(id)] ?? String(id)}</span>
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {t("pendingCreatedAt", {
                    value: f.dateTime(new Date(d.createdAt), {
                      dateStyle: "short",
                      timeStyle: "short",
                    }),
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {editing ? (
            <>
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" form={`edit-${pending.id}`} onClick={() => {}} variant="outline" size="sm" disabled={isPending}>
                {t("save")}
              </Button>

            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              {t("edit")}
            </Button>
          )}
        </div>
        {!editing && (
          <PendingActions
            id={pending.id}
            descriptionCount={items.length}
            approveAction={approveAction}
            rejectAction={rejectAction}
          />
        )}
      </CardFooter>
    </Card>
  );
}
