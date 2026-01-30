"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetcher } from "@/lib/fetcher";
import type { DictionaryFilterInput } from "@/types/dictionary-bulk";
import type { DictionaryTemplateItem, DictionaryTemplatesResponse, FilterStats } from "@/types/dictionary-templates";
import { FilterStatsSummary } from "./FilterStatsSummary";
import { TemplatePicker } from "./TemplatePicker";

const normalizeTemplate = (tpl: DictionaryTemplateItem): DictionaryFilterInput => ({
  language: tpl.language,
  query: tpl.query ?? undefined,
  scope: tpl.scope === "def" || tpl.scope === "both" ? tpl.scope : "word",
  tagNames: tpl.tagNames ?? [],
  excludeTagNames: tpl.excludeTagNames ?? [],
  searchMode: tpl.searchMode === "startsWith" || tpl.searchMode === "exact" ? tpl.searchMode : "contains",
  lenFilterField: tpl.lenFilterField === "word" || tpl.lenFilterField === "def" ? tpl.lenFilterField : undefined,
  lenMin: typeof tpl.lenMin === "number" ? tpl.lenMin : undefined,
  lenMax: typeof tpl.lenMax === "number" ? tpl.lenMax : undefined,
  difficultyMin: typeof tpl.difficultyMin === "number" ? tpl.difficultyMin : undefined,
  difficultyMax: typeof tpl.difficultyMax === "number" ? tpl.difficultyMax : undefined,
});

export function FilterTemplatesPickerModal({
  open,
  onOpenChange,
  language,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  language: string;
  onApply: (filter: DictionaryFilterInput) => void;
}) {
  const t = useTranslations();
  const [templates, setTemplates] = useState<DictionaryTemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [stats, setStats] = useState<FilterStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);

  const selected = useMemo(() => templates.find((tpl) => tpl.id === selectedId) ?? null, [templates, selectedId]);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setTemplates([]);
      setError(false);
      setLoading(false);
      setStats(null);
      setStatsError(false);
      setStatsLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(false);
    fetcher<DictionaryTemplatesResponse>(`/api/dictionary/templates?lang=${encodeURIComponent(language)}`)
      .then((res) => {
        if (!active) return;
        setTemplates(res.items ?? []);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setTemplates([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, language]);

  useEffect(() => {
    if (!open) return;
    if (!selected) {
      setStats(null);
      setStatsError(false);
      setStatsLoading(false);
      return;
    }
    let active = true;
    setStatsLoading(true);
    setStatsError(false);
    fetcher<FilterStats>("/api/dictionary/filter-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalizeTemplate(selected)),
    })
      .then((data) => {
        if (!active) return;
        setStats(data);
      })
      .catch(() => {
        if (!active) return;
        setStatsError(true);
        setStats(null);
      })
      .finally(() => {
        if (!active) return;
        setStatsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, selected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("templateApplyTitle")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <TemplatePicker
            templates={templates}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading}
            error={error}
          />
          <FilterStatsSummary
            stats={stats}
            loading={statsLoading}
            error={statsError}
            hint={!selected ? t("templateStatsSelectHint") : undefined}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              onApply(normalizeTemplate(selected));
              onOpenChange(false);
            }}
          >
            {t("templateApplyAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
