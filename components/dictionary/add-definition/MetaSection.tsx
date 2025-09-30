"use client";
import { useFormatter, useTranslations } from "next-intl";
import type { UseFormRegisterReturn } from "react-hook-form";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Tag, TagPicker } from "./TagPicker";

export function MetaSection({
  noteLabelId,
  noteInput,
  submitting,
  difficulty,
  difficulties,
  onDifficultyChange,
  endId,
  endDate,
  onEndDateChange,
  wordId,
  selectedTags,
  onAddTag,
  onRemoveTag,
}: {
  noteLabelId: string;
  noteInput: UseFormRegisterReturn;
  submitting: boolean;
  difficulty: number;
  difficulties: number[];
  onDifficultyChange: (n: number) => void;
  endId: string;
  endDate: Date | null;
  onEndDateChange: (d: Date | null) => void;
  wordId: string;
  selectedTags: Tag[];
  onAddTag: (t: Tag) => void;
  onRemoveTag: (id: number) => void;
}) {
  const t = useTranslations();
  const f = useFormatter();
  return (
    <>
      <div className="grid gap-2 mt-3">
        <span
          className="text-sm text-muted-foreground"
          id={`${noteLabelId}-label`}
        >
          {t("note")}
        </span>
        <Input
          id={noteLabelId}
          aria-labelledby={`${noteLabelId}-label`}
          disabled={submitting}
          {...noteInput}
        />
      </div>
      <div className="grid gap-2 grid-cols-1 md:grid-cols-[5rem_10rem_1fr] items-start">
        <div className="grid gap-1 w-full min-w-0">
          <span className="text-sm text-muted-foreground">
            {t("difficultyFilterLabel")}
          </span>
          <Select
            value={String(difficulty)}
            onValueChange={(v) => onDifficultyChange(Number.parseInt(v, 10))}
          >
            <SelectTrigger
              className="w-full"
              aria-label={t("difficultyFilterLabel")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(difficulties.length ? difficulties : [1, 2, 3, 4, 5]).map(
                (d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1 w-full min-w-0">
          <span className="text-sm text-muted-foreground">{t("endDate")}</span>
          <DateField
            id={endId}
            label={undefined}
            value={endDate}
            onChange={onEndDateChange}
            placeholder={t("noLimit")}
            captionLayout="dropdown"
            buttonClassName="w-full justify-start"
            formatLabel={(d) => f.dateTime(d, { dateStyle: "medium" })}
            clearText={t("clear")}
          />
        </div>
        <TagPicker
          wordId={wordId}
          selected={selectedTags}
          onAdd={onAddTag}
          onRemove={onRemoveTag}
        />
      </div>
    </>
  );
}
