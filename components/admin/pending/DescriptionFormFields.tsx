"use client";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { HiddenSelectField } from "@/components/ui/hidden-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetcher } from "@/lib/fetcher";

export type LanguageOption = { code: string; name?: string | null };

export function DescriptionFormFields({
  idx,
  descId,
  description,
  endDateIso,
  showWordInput,
  defaultWord,
  languages,
  defaultLanguageCode,
  difficulties,
  defaultDifficulty,
  initialTagIds,
  tagNames,
  disableLanguage,
  allowDelete,
}: {
  idx: number;
  descId: string;
  description: string;
  endDateIso?: string | null;
  showWordInput: boolean;
  defaultWord?: string;
  languages: LanguageOption[];
  defaultLanguageCode?: string;
  difficulties: readonly number[];
  defaultDifficulty?: number | null;
  initialTagIds: number[];
  tagNames: Record<string, string>;
  disableLanguage?: boolean;
  allowDelete?: boolean;
}) {
  const t = useTranslations();
  const endDate = endDateIso ? new Date(endDateIso) : null;
  const [markedDelete, setMarkedDelete] = useState(false);

  // Tags state
  type Tag = { id: number; name: string };
  const initialSelected: Tag[] = useMemo(
    () =>
      initialTagIds.map((id) => ({
        id,
        name: tagNames[String(id)] ?? String(id),
      })),
    [initialTagIds, tagNames],
  );
  const [selectedTags, setSelectedTags] = useState<Tag[]>(initialSelected);
  const [tagQuery, setTagQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Tag[]>([]);

  async function searchTags(q: string) {
    const res = await fetcher<{ items: { id: number; name: string }[] }>(`/api/tags?q=${encodeURIComponent(q)}`);
    // Dedup already selected
    const ids = new Set(selectedTags.map((t) => t.id));
    setSuggestions(res.items.filter((t) => !ids.has(t.id)));
  }

  async function createTagByName(name: string) {
    const created = await fetcher<{ id: number; name: string }>("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    addTag(created);
  }

  function addTag(tag: Tag) {
    if (selectedTags.some((t) => t.id === tag.id)) return;
    setSelectedTags((prev) => [...prev, tag]);
    setTagQuery("");
    setSuggestions([]);
  }

  function removeTag(id: number) {
    setSelectedTags((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <>
      {showWordInput && (
        <div className="mb-2">
          <span className="text-xs text-muted-foreground mr-2">{t("word")}</span>
          <Input name="word" defaultValue={defaultWord} className="h-7 w-60 text-xs" />
        </div>
      )}

      <div className="flex items-start gap-2">
        <Textarea name={`desc_text_${descId}`} defaultValue={description} className="min-h-12 text-sm" />
        {allowDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-1 h-8 w-8"
                onClick={() => setMarkedDelete((v) => !v)}
                aria-label={t("toggleRemove")}
              >
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8} className="z-50 whitespace-nowrap">
              {t("toggleRemove")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {markedDelete && <input type="hidden" name="delete_desc_ids" value={descId} readOnly />}
      {markedDelete && <div className="text-xs text-destructive">{t("toggleRemove")}</div>}

      <div className="mt-2 space-y-3 text-xs">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t("endDate")}</span>
          <DateField
            value={endDate ?? null}
            placeholder={t("noLimit")}
            captionLayout="dropdown"
            clearText={t("clear")}
            buttonClassName="h-7 w-36 px-2 text-xs justify-start"
            hiddenInputName={`desc_end_${descId}`}
          />
        </div>

        <div className="flex items-start gap-3">
          {idx === 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">{t("language")}</span>
              <HiddenSelectField
                name="language"
                defaultValue={defaultLanguageCode ?? undefined}
                ariaLabel={t("language")}
                triggerClassName="!h-7 w-28 justify-start px-2 text-xs"
                disabled={disableLanguage}
                options={languages.map((l) => ({
                  value: l.code,
                  label: l.name ? `${l.name} (${l.code})` : l.code,
                }))}
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">{t("difficultyFilterLabel")}</span>
            <HiddenSelectField
              name={`desc_diff_${descId}`}
              defaultValue={String(defaultDifficulty ?? 1)}
              ariaLabel={t("difficultyFilterLabel")}
              triggerClassName="!h-7 w-14 justify-start px-2 text-xs"
              options={difficulties.map((n) => ({
                value: String(n),
                label: String(n),
              }))}
            />
          </div>
        </div>

        {/* Tags editor */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t("tags")}</span>
          <input
            className="w-full px-3 py-1.5 border rounded text-xs bg-background"
            placeholder={t("addTagsPlaceholder")}
            value={tagQuery}
            onChange={async (e) => {
              const v = e.target.value;
              setTagQuery(v);
              if (v.trim()) await searchTags(v.trim());
              else setSuggestions([]);
            }}
            list={`tags-suggest-${descId}`}
            onKeyDown={async (e) => {
              const v = tagQuery.trim();
              const exists = suggestions.some((s) => s.name.toLowerCase() === v.toLowerCase());
              if (e.key === "Enter" && v && !exists) {
                e.preventDefault();
                await createTagByName(v);
                setTagQuery("");
              }
            }}
          />
          <datalist id={`tags-suggest-${descId}`}>
            {suggestions.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          {suggestions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {suggestions.map((s) => (
                <Badge key={s.id} variant="outline" className="cursor-pointer" onClick={() => addTag(s)}>
                  <span className="mb-1 h-3">{s.name}</span>
                </Badge>
              ))}
            </div>
          )}
          {selectedTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedTags.map((tItem) => (
                <Badge key={tItem.id} variant="secondary" className="gap-1">
                  <span className="mb-1 h-3">{tItem.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="inline-flex h-4 w-4 items-center justify-center p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => removeTag(tItem.id)}
                    aria-label={t("delete")}
                  >
                    <X className="size-3" aria-hidden />
                  </Button>
                </Badge>
              ))}
            </div>
          )}
          <input
            type="hidden"
            name={`desc_tags_${descId}`}
            value={JSON.stringify(selectedTags.map((t) => t.id))}
            readOnly
          />
        </div>
      </div>
    </>
  );
}
