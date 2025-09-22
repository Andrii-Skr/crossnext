"use client";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PendingActions } from "@/components/PendingActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_DIFFICULTIES } from "@/app/constants/constants";
import { useDifficulties } from "@/lib/useDifficulties";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetcher } from "@/lib/fetcher";

type Description = {
  id: string;
  description: string;
  difficulty?: number | null;
  createdAt: string; // ISO
  end_date?: string | null;
  note?: string | null;
};

type LanguageLike = {
  id?: number | string | null;
  code?: string | null;
  name?: string | null;
};

type LanguageOption = {
  id: number | string;
  code: string;
  name?: string | null;
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
    language?: LanguageLike | null;
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
  const router = useRouter();
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

  const { data: languageResponse } = useQuery({
    queryKey: ["languages"],
    queryFn: () => fetcher<{ items: LanguageOption[] }>("/api/languages"),
    staleTime: 5 * 60_000,
  });

  const pendingLanguage = pending.language ?? null;
  const pendingLangCode =
    pendingLanguage?.code ?? pending.langCode ?? null;
  const pendingLangName =
    pendingLanguage?.name ?? pending.langName ?? null;
  const pendingLangId = pendingLanguage?.id ?? null;

  const languageOptions = useMemo(() => {
    const base = languageResponse?.items ?? [];
    if (base.length) {
      const seen = new Set<string>();
      const normalized: LanguageOption[] = [];
      base.forEach((lang, index) => {
        if (!lang?.code) return;
        const code = String(lang.code).trim();
        if (!code) return;
        const key = code.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push({
          id: lang.id ?? `${code}-${index}`,
          code,
          name: lang.name ?? null,
        });
      });
      if (normalized.length) return normalized;
    }
    if (pendingLangCode)
      return [
        {
          id: pendingLangId ?? pendingLangCode,
          code: pendingLangCode,
          name: pendingLangName ?? pendingLangCode,
        },
      ];
    return [];
  }, [
    languageResponse?.items,
    pendingLangCode,
    pendingLangId,
    pendingLangName,
  ]);

  const languageDefault = pendingLangCode ?? languageOptions[0]?.code ?? "";

  const { data: diffData } = useDifficulties(true);
  const difficulties = (diffData && diffData.length
    ? diffData
    : (DEFAULT_DIFFICULTIES as readonly number[])) as readonly number[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="truncate">{pending.word_text}</span>
          <div className="flex items-center gap-2">
            <Badge>{pendingLangName ?? pendingLangCode ?? ""}</Badge>
            {pending.targetWordId ? (
              <Badge variant="outline">
                {t("pendingExisting", { id: pending.targetWordId })}
              </Badge>
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
                try {
                  await saveAction(fd);
                  toast.success(t("pendingSaved" as never));
                  setEditing(false);
                } catch {
                  toast.error(t("saveError" as never));
                } finally {
                  router.refresh();
                }
              })
            }
            className="space-y-3"
          >
            <input type="hidden" name="id" value={pending.id} />
            {!pending.targetWordId && (
              <div className="mb-2">
                <span className="text-xs text-muted-foreground mr-2">
                  {t("word")}
                </span>
                <Input name="word" defaultValue={pending.word_text} />
              </div>
            )}
            {items.map((d, idx) => (
              <div key={d.id} className="rounded-md border p-3">
                <Textarea
                  name={`desc_text_${d.id}`}
                  defaultValue={d.description}
                  className="min-h-12 text-sm"
                />
                <div className="mt-2 space-y-3 text-xs">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground">{t("endDate")}</span>
                    <DateField
                      value={d.end_date ? new Date(d.end_date) : null}
                      placeholder={t("noLimit")}
                      clearText={t("clear")}
                      buttonClassName="h-7 w-40 justify-start px-2 text-xs"
                      hiddenInputName={`desc_end_${d.id}`}
                      ariaLabel={t("endDate")}
                    />
                  </div>
                  <div className="flex items-start gap-3">
                    {idx === 0 ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground">
                          {t("language")}
                        </span>
                        <input
                          type="hidden"
                          name="language"
                          defaultValue={languageDefault}
                        />
                        <Select
                          defaultValue={languageDefault}
                          onValueChange={(v) => {
                            const el = document.querySelector<HTMLInputElement>(
                              `#edit-${pending.id} input[name="language"]`,
                            );
                            if (el) el.value = v;
                          }}
                          disabled={!languageOptions.length}
                        >
                          <SelectTrigger className="h-7 w-40 justify-start">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {languageOptions.map((lang) => (
                              <SelectItem key={lang.code} value={lang.code}>
                                {lang.name
                                  ? `${lang.name} (${lang.code})`
                                  : lang.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">
                        {t("difficultyFilterLabel")}
                      </span>
                      <input
                        type="hidden"
                        name={`desc_diff_${d.id}`}
                        defaultValue={String(d.difficulty ?? 1)}
                      />
                      <Select
                        defaultValue={String(d.difficulty ?? 1)}
                        onValueChange={(v) => {
                          const el = document.querySelector<HTMLInputElement>(
                            `#edit-${pending.id} input[name="desc_diff_${d.id}"]`,
                          );
                          if (el) el.value = v;
                        }}
                      >
                        <SelectTrigger className="h-7 w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {difficulties.map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                {tagsByDesc.get(d.id)?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tagsByDesc.get(d.id)?.map((id) => (
                      <Badge key={id} variant="outline">
                        <span className="mb-1 h-3">
                          {tagNames[String(id)] ?? String(id)}
                        </span>
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
              <p className="text-sm text-muted-foreground">
                {t("pendingNoDescriptions")}
              </p>
            )}
            {items.map((d) => (
              <div key={d.id} className="rounded-md border p-3">
                <div className="text-sm whitespace-pre-wrap break-words">
                  {d.description}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {t("difficultyFilterLabel")}
                  </span>
                  <Badge variant="outline">{d.difficulty ?? 1}</Badge>
                  {d.end_date ? (
                    <Badge variant="outline">
                      {t("until", {
                        value: f.dateTime(new Date(d.end_date), {
                          dateStyle: "short",
                        }),
                      })}
                    </Badge>
                  ) : null}
                </div>
                {tagsByDesc.get(d.id)?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tagsByDesc.get(d.id)?.map((id) => (
                      <Badge key={id} variant="outline">
                        <span className="mb-1 h-3">
                          {tagNames[String(id)] ?? String(id)}
                        </span>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                form={`edit-${pending.id}`}
                variant="outline"
                size="sm"
                disabled={isPending}
              >
                {t("save")}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
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
