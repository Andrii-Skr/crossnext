"use client";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { type TagOption, TagSelector } from "@/components/tags/TagSelector";
import { Button } from "@/components/ui/button";
import { EndDateSelect } from "@/components/ui/end-date-select";
import { HiddenSelectField } from "@/components/ui/hidden-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  const endDate = useMemo(() => (endDateIso ? new Date(endDateIso) : null), [endDateIso]);
  const [markedDelete, setMarkedDelete] = useState(false);
  const [endLocal, setEndLocal] = useState<Date | null>(endDate);
  useEffect(() => {
    setEndLocal((prev) => {
      const prevTime = prev?.getTime();
      const nextTime = endDate?.getTime();
      if (prevTime === nextTime) return prev;
      return endDate;
    });
  }, [endDate]);

  // Tags state
  const initialSelected: TagOption[] = useMemo(
    () =>
      initialTagIds.map((id) => ({
        id,
        name: tagNames[String(id)] ?? String(id),
      })),
    [initialTagIds, tagNames],
  );
  const [selectedTags, setSelectedTags] = useState<TagOption[]>(initialSelected);

  return (
    <>
      {showWordInput && (
        <div className="mb-2">
          <span className="text-xs text-muted-foreground mr-2">{t("word")}</span>
          <Input
            name="word"
            defaultValue={defaultWord}
            className="h-7 w-60 text-xs"
            autoComplete="off"
            suppressHydrationWarning
          />
        </div>
      )}

      <div className="flex items-start gap-2">
        <Textarea
          name={`desc_text_${descId}`}
          defaultValue={description}
          className="min-h-12 text-sm"
          autoComplete="off"
          suppressHydrationWarning
        />
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
          <EndDateSelect
            value={endLocal}
            onChange={setEndLocal}
            name={`desc_end_${descId}`}
            triggerClassName="h-7 w-36 px-2 text-xs justify-between"
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
        <TagSelector
          selected={selectedTags}
          onChange={setSelectedTags}
          inputId={`desc-tags-${descId}`}
          labelKey="tags"
          placeholderKey="addTagsPlaceholder"
          createLabelKey="createTagNamed"
          hiddenInputName={`desc_tags_${descId}`}
          inputSize="sm"
        />
      </div>
    </>
  );
}
