"use client";
import { useTranslations } from "next-intl";
import type { UseFormRegisterReturn } from "react-hook-form";
import { EndDateSelect } from "@/components/ui/end-date-select";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Tag, TagPicker } from "./TagPicker";

export function MetaSection({
  noteLabelId,
  noteInput,
  noteAutoComplete,
  submitting,
  difficulty,
  difficulties,
  onDifficultyChange,
  endDate,
  onEndDateChange,
  wordId,
  selectedTags,
  onAddTag,
  onRemoveTag,
}: {
  noteLabelId: string;
  noteInput: UseFormRegisterReturn;
  noteAutoComplete?: string;
  submitting: boolean;
  difficulty: number;
  difficulties: number[];
  onDifficultyChange: (n: number) => void;
  endDate: Date | null;
  onEndDateChange: (d: Date | null) => void;
  wordId: string;
  selectedTags: Tag[];
  onAddTag: (t: Tag) => void;
  onRemoveTag: (id: number) => void;
}) {
  const t = useTranslations();

  return (
    <>
      <div className="grid gap-2 mt-3">
        <span className="text-sm text-muted-foreground" id={`${noteLabelId}-label`}>
          {t("note")}
        </span>
        <Input
          id={noteLabelId}
          aria-labelledby={`${noteLabelId}-label`}
          disabled={submitting}
          autoComplete={noteAutoComplete}
          {...noteInput}
        />
      </div>
      <div className="grid gap-2 md:gap-3 grid-cols-1 md:grid-cols-[5rem_12rem_1fr] items-start">
        <div className="grid gap-1 w-full min-w-0">
          <span className="text-sm text-muted-foreground">{t("difficultyFilterLabel")}</span>
          <Select value={String(difficulty)} onValueChange={(v) => onDifficultyChange(Number.parseInt(v, 10))}>
            <SelectTrigger className="w-full" aria-label={t("difficultyFilterLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(difficulties.length ? difficulties : [1, 2, 3, 4, 5]).map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <EndDateSelect
          value={endDate}
          onChange={onEndDateChange}
          label={t("endDate")}
          triggerClassName="w-full"
          disabled={submitting}
        />
        <TagPicker wordId={wordId} selected={selectedTags} onAdd={onAddTag} onRemove={onRemoveTag} />
      </div>
    </>
  );
}
