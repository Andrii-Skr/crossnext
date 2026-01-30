"use client";

import { useEffect, useMemo, useState } from "react";
import { fetcher } from "@/lib/fetcher";
import type { DictionaryFilterInput } from "@/types/dictionary-bulk";
import type { DictionaryTemplateItem, DictionaryTemplatesResponse, FilterStats } from "@/types/dictionary-templates";

export function useScanwordsTemplates({ selectedTemplateId }: { selectedTemplateId: number | null }) {
  const [templates, setTemplates] = useState<DictionaryTemplateItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState(false);
  const [stats, setStats] = useState<FilterStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [dictionaryStats, setDictionaryStats] = useState<FilterStats | null>(null);
  const [dictionaryStatsLoading, setDictionaryStatsLoading] = useState(false);
  const [dictionaryStatsError, setDictionaryStatsError] = useState(false);

  const selectedTemplate = useMemo(() => {
    if (selectedTemplateId == null) return null;
    return templates.find((template) => template.id === selectedTemplateId) ?? null;
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    let active = true;
    setTemplatesLoading(true);
    setTemplatesError(false);
    fetcher<DictionaryTemplatesResponse>("/api/dictionary/templates")
      .then((data) => {
        if (!active) return;
        setTemplates(data.items);
      })
      .catch(() => {
        if (!active) return;
        setTemplatesError(true);
      })
      .finally(() => {
        if (!active) return;
        setTemplatesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTemplate) {
      setStats(null);
      setStatsLoading(false);
      setStatsError(false);
      return;
    }

    let active = true;
    const filter: DictionaryFilterInput = {
      language: selectedTemplate.language,
      query: selectedTemplate.query ?? undefined,
      scope: selectedTemplate.scope === "def" || selectedTemplate.scope === "both" ? selectedTemplate.scope : "word",
      tagNames: selectedTemplate.tagNames?.length ? selectedTemplate.tagNames : undefined,
      excludeTagNames: selectedTemplate.excludeTagNames?.length ? selectedTemplate.excludeTagNames : undefined,
      searchMode:
        selectedTemplate.searchMode === "startsWith" || selectedTemplate.searchMode === "exact"
          ? selectedTemplate.searchMode
          : "contains",
      lenFilterField:
        selectedTemplate.lenFilterField === "word" || selectedTemplate.lenFilterField === "def"
          ? selectedTemplate.lenFilterField
          : undefined,
      lenMin: typeof selectedTemplate.lenMin === "number" ? selectedTemplate.lenMin : undefined,
      lenMax: typeof selectedTemplate.lenMax === "number" ? selectedTemplate.lenMax : undefined,
      difficultyMin: typeof selectedTemplate.difficultyMin === "number" ? selectedTemplate.difficultyMin : undefined,
      difficultyMax: typeof selectedTemplate.difficultyMax === "number" ? selectedTemplate.difficultyMax : undefined,
    };

    setStatsLoading(true);
    setStatsError(false);
    fetcher<FilterStats>("/api/dictionary/filter-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filter),
    })
      .then((data) => {
        if (!active) return;
        setStats(data);
      })
      .catch(() => {
        if (!active) return;
        setStats(null);
        setStatsError(true);
      })
      .finally(() => {
        if (!active) return;
        setStatsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedTemplate]);

  useEffect(() => {
    if (!selectedTemplate?.language) {
      setDictionaryStats(null);
      setDictionaryStatsLoading(false);
      setDictionaryStatsError(false);
      return;
    }

    let active = true;
    setDictionaryStatsLoading(true);
    setDictionaryStatsError(false);
    fetcher<FilterStats>("/api/dictionary/filter-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: selectedTemplate.language }),
    })
      .then((data) => {
        if (!active) return;
        setDictionaryStats(data);
      })
      .catch(() => {
        if (!active) return;
        setDictionaryStats(null);
        setDictionaryStatsError(true);
      })
      .finally(() => {
        if (!active) return;
        setDictionaryStatsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedTemplate?.language]);

  return {
    templates,
    templatesLoading,
    templatesError,
    selectedTemplate,
    stats,
    statsLoading,
    statsError,
    dictionaryStats,
    dictionaryStatsLoading,
    dictionaryStatsError,
  };
}
